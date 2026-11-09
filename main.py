"""
CalfWatch AI - Newborn Calf Monitoring System
CLI entry point wiring together detection, behaviour classification, risk assessment,
and real-time state logging.
"""

from __future__ import annotations
import os
import sys
import time
import json
import argparse
from pathlib import Path
import cv2
import numpy as np

from core.schemas import Detection, CalfTimeline, RiskAssessment
from core.utils import (
    load_config,
    save_state,
    init_run_log,
    log_event,
    draw_detection,
    draw_hud,
    format_seconds,
    format_minutes
)
from detection.calf_detection import CalfDetector
from behaviour.behaviour_detection import BehaviourAnalyzer
from risk.risk_engine import assess as assess_risk


def run_demo_pipeline(config: dict, speed: float = 1.0) -> None:
    """
    Replay scripted events from demo_events.json with NO video and NO neural net required.
    Ensures a working demonstration under all circumstances.
    """
    demo_file = config.get("system", {}).get("demo_events_path", "data/demo_events.json")
    if not os.path.exists(demo_file):
        raise FileNotFoundError(f"Demo events file not found at: {demo_file}")

    with open(demo_file, "r", encoding="utf-8") as f:
        demo_data = json.load(f)

    events = demo_data.get("events", [])
    print(f"\n=======================================================")
    print(f"   CALFWATCH AI — DEMO MODE (Scripted Event Replay)   ")
    print(f"=======================================================")
    print(f"Scenario: {demo_data.get('scenario_description', 'Standard Demo')}")
    print(f"Total event milestones: {len(events)}")
    print(f"Writing outputs to: {config.get('system', {}).get('output_dir', 'output')}/\n")

    output_dir = config.get("system", {}).get("output_dir", "output")
    state_file = os.path.join(output_dir, config.get("system", {}).get("state_filename", "state.json"))
    log_file = os.path.join(output_dir, config.get("system", {}).get("run_log_filename", "run_log.csv"))
    frame_preview_path = os.path.join(output_dir, "latest_frame.jpg")

    os.makedirs(output_dir, exist_ok=True)
    init_run_log(log_file, overwrite=True)

    demo_config = dict(config)
    demo_config["behaviour"] = dict(config.get("behaviour", {}))
    demo_config["behaviour"]["debounce_frames"] = 1

    analyzer = BehaviourAnalyzer(demo_config)
    last_known_states: dict[int, str] = {}
    last_known_risks: dict[int, str] = {}

    for step_idx, event in enumerate(events):
        real_time_s = float(event.get("time_step_s", step_idx))
        sim_minutes = float(event.get("sim_minutes", real_time_s))
        sim_seconds = sim_minutes * 60.0

        raw_detections = event.get("detections", [])
        detections: list[Detection] = []
        for d in raw_detections:
            detections.append(
                Detection(
                    track_id=int(d["track_id"]),
                    label=str(d["label"]),
                    bbox=tuple(map(int, d["bbox"])),
                    confidence=float(d.get("confidence", 0.90)),
                    frame_index=step_idx,
                    timestamp_s=sim_seconds
                )
            )

        # 1. Update Behaviour State Machine
        curr_states = analyzer.update(detections)
        timelines = analyzer.all_timelines()

        # 2. Assess Risk for Each Tracked Calf
        calves_data = {}
        highest_risk = "LOW"
        critical_alerts: list[str] = []

        status_items = []
        for t_id, timeline in timelines.items():
            assessment = assess_risk(timeline, sim_minutes, config)
            calves_data[str(t_id)] = {
                "track_id": t_id,
                "current_behaviour": timeline.current_behaviour,
                "time_in_state_s": timeline.time_in_current_state_s,
                "first_seen_s": timeline.first_seen_s,
                "first_stand_s": timeline.first_stand_s,
                "first_suckle_s": timeline.first_suckle_s,
                "risk": assessment.to_dict()
            }

            # Check and log behaviour changes
            prev_b = last_known_states.get(t_id)
            if prev_b != timeline.current_behaviour:
                log_event(log_file, sim_seconds, t_id, "BEHAVIOUR_CHANGE", timeline.current_behaviour)
                last_known_states[t_id] = timeline.current_behaviour

            # Check and log risk changes
            prev_r = last_known_risks.get(t_id)
            if prev_r != assessment.level:
                log_event(log_file, sim_seconds, t_id, "RISK_LEVEL_CHANGE", f"{assessment.level} ({assessment.score}pts)")
                last_known_risks[t_id] = assessment.level

            # Track highest risk across all calves
            if assessment.level == "HIGH":
                highest_risk = "HIGH"
                critical_alerts.append(f"Calf #{t_id}: {assessment.recommended_action}")
            elif assessment.level == "MEDIUM" and highest_risk != "HIGH":
                highest_risk = "MEDIUM"

            status_items.append(f"ID {t_id}: {timeline.current_behaviour.upper()} [{assessment.level}: {assessment.score}pts]")

        # 3. Build & Save System State JSON
        has_alert = len(critical_alerts) > 0
        alert_msg = " | ".join(critical_alerts) if has_alert else ""

        state_payload = {
            "timestamp_s": sim_seconds,
            "real_time_s": real_time_s,
            "sim_minutes": sim_minutes,
            "total_tracked_calves": len(timelines),
            "calves": calves_data,
            "alert": {
                "active": has_alert,
                "highest_risk": highest_risk,
                "message": alert_msg
            }
        }
        save_state(state_payload, state_file)

        # 4. Render Synthetic Preview Frame for UI
        canvas = np.zeros((480, 900, 3), dtype=np.uint8)
        # Background barn ground tone
        canvas[:] = (45, 55, 50)
        # Draw grid
        for gy in range(0, 480, 40):
            cv2.line(canvas, (0, gy), (900, gy), (55, 65, 60), 1)

        for det in detections:
            t_risk = calves_data.get(str(det.track_id), {}).get("risk", {}).get("level", "LOW") if det.label == "calf" else None
            t_beh = calves_data.get(str(det.track_id), {}).get("current_behaviour", None) if det.label == "calf" else None
            draw_detection(
                frame=canvas,
                bbox=det.bbox,
                label=det.label,
                track_id=det.track_id,
                behaviour=t_beh,
                risk_level=t_risk,
                confidence=det.confidence
            )

        draw_hud(
            frame=canvas,
            sim_time_s=sim_seconds,
            real_time_s=real_time_s,
            active_calves_count=len(calves_data),
            alert_message=critical_alerts[0] if critical_alerts else None
        )
        cv2.imwrite(frame_preview_path, canvas)

        # 5. Clean Console Output (1-line-per-second status)
        time_display = f"[Step {step_idx+1}/{len(events)} | Sim: {sim_minutes:5.1f}m]"
        status_line = " | ".join(status_items) if status_items else "No calves"
        alert_flag = f" !! {highest_risk} ALERT !!" if highest_risk == "HIGH" else ""
        print(f"{time_display} {status_line}{alert_flag}")

        # Pacing delay between simulated ticks
        if step_idx < len(events) - 1:
            time.sleep(1.0 / max(0.1, speed))

    print("\n[Demo Complete] Final state saved to 'output/state.json'.")
    print("Launch dashboard to visualize: 'streamlit run dashboard/app.py'")


def run_video_pipeline(
    video_path: str,
    config: dict,
    headless: bool = False,
    frame_skip: Optional[int] = None,
    imgsz: Optional[int] = None
) -> None:
    """
    Run video inference pipeline using YOLO calf detector, behaviour classification,
    and risk assessment with configurable frame-skipping and resolution speedups.
    """
    output_dir = config.get("system", {}).get("output_dir", "output")
    state_file = os.path.join(output_dir, config.get("system", {}).get("state_filename", "state.json"))
    log_file = os.path.join(output_dir, config.get("system", {}).get("run_log_filename", "run_log.csv"))
    out_video_path = os.path.join(output_dir, config.get("system", {}).get("annotated_video_filename", "annotated_output.mp4"))
    frame_preview_path = os.path.join(output_dir, "latest_frame.jpg")

    os.makedirs(output_dir, exist_ok=True)
    init_run_log(log_file)

    # Initialize video capture
    source = 0 if video_path == "0" else video_path
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[Error] Could not open video source: '{video_path}'")
        print("[Fallback] Switching to demo mode...")
        run_demo_pipeline(config)
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0 or np.isnan(fps):
        fps = 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    time_scale = float(config.get("system", {}).get("time_scale", 60.0))

    # Determine acceleration settings
    det_cfg = config.get("detection", {})
    actual_skip = frame_skip if frame_skip is not None else int(det_cfg.get("frame_skip", 4))
    actual_imgsz = imgsz if imgsz is not None else int(det_cfg.get("imgsz", 480))

    print(f"\n=======================================================")
    print(f"   CALFWATCH AI — VIDEO MONITORING PIPELINE            ")
    print(f"=======================================================")
    print(f"Source: {video_path} ({width}x{height} @ {fps:.1f} FPS, {total_frames} frames)")
    print(f"Acceleration: sample 1 in every {actual_skip} frames @ {actual_imgsz}px resolution")
    print(f"Time scale: {time_scale:.1f}x (1 real sec = {time_scale/60.0:.1f} sim min)")
    print(f"Saving outputs to: {output_dir}/\n")

    # Initialize modules with accelerated resolution
    detector = CalfDetector(
        model_path=det_cfg.get("model_path", "yolov8n.pt"),
        conf=float(det_cfg.get("conf", 0.35)),
        device=det_cfg.get("device", "cpu"),
        imgsz=actual_imgsz
    )
    analyzer = BehaviourAnalyzer(config)

    # Optional video writer
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_video_path, fourcc, fps, (width, height))

    frame_idx = 0
    last_status_print = 0.0
    last_known_states: dict[int, str] = {}
    last_known_risks: dict[int, str] = {}
    last_detections: list[Detection] = []

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            real_time_s = frame_idx / fps
            sim_seconds = real_time_s * time_scale
            sim_minutes = sim_seconds / 60.0

            # 1. Detection & Tracking (run inference on sampled frames)
            if frame_idx % actual_skip == 0 or not last_detections:
                detections = detector.detect(frame, frame_index=frame_idx, timestamp_s=sim_seconds)
                last_detections = detections
            else:
                detections = last_detections

            # Graceful degradation if no calves detected
            if not detections:
                if time.time() - last_status_print >= 1.0:
                    print(f"[T={real_time_s:5.1f}s | Sim: {sim_minutes:5.1f}m] No calf detected — monitoring...")
                    last_status_print = time.time()
                frame_idx += 1
                writer.write(frame)
                continue

            # 2. Behaviour update
            analyzer.update(detections, frame=frame)
            timelines = analyzer.all_timelines()

            # 3. Risk Assessment
            calves_data = {}
            highest_risk = "LOW"
            critical_alerts: list[str] = []
            status_items = []

            for t_id, timeline in timelines.items():
                assessment = assess_risk(timeline, sim_minutes, config)
                calves_data[str(t_id)] = {
                    "track_id": t_id,
                    "current_behaviour": timeline.current_behaviour,
                    "time_in_state_s": timeline.time_in_current_state_s,
                    "first_seen_s": timeline.first_seen_s,
                    "first_stand_s": timeline.first_stand_s,
                    "first_suckle_s": timeline.first_suckle_s,
                    "risk": assessment.to_dict()
                }

                # Event logging on transitions
                prev_b = last_known_states.get(t_id)
                if prev_b != timeline.current_behaviour:
                    log_event(log_file, sim_seconds, t_id, "BEHAVIOUR_CHANGE", timeline.current_behaviour)
                    last_known_states[t_id] = timeline.current_behaviour

                prev_r = last_known_risks.get(t_id)
                if prev_r != assessment.level:
                    log_event(log_file, sim_seconds, t_id, "RISK_LEVEL_CHANGE", f"{assessment.level} ({assessment.score}pts)")
                    last_known_risks[t_id] = assessment.level

                if assessment.level == "HIGH":
                    highest_risk = "HIGH"
                    critical_alerts.append(f"Calf #{t_id}: {assessment.recommended_action}")
                elif assessment.level == "MEDIUM" and highest_risk != "HIGH":
                    highest_risk = "MEDIUM"

                status_items.append(f"ID {t_id}: {timeline.current_behaviour.upper()} [{assessment.level}: {assessment.score}pts]")

            # 4. Save State JSON
            has_alert = len(critical_alerts) > 0
            state_payload = {
                "timestamp_s": sim_seconds,
                "real_time_s": real_time_s,
                "sim_minutes": sim_minutes,
                "total_tracked_calves": len(timelines),
                "calves": calves_data,
                "alert": {
                    "active": has_alert,
                    "highest_risk": highest_risk,
                    "message": " | ".join(critical_alerts) if has_alert else ""
                }
            }
            save_state(state_payload, state_file)

            # 5. Drawing annotations
            for det in detections:
                t_risk = calves_data.get(str(det.track_id), {}).get("risk", {}).get("level", "LOW") if det.label == "calf" else None
                t_beh = calves_data.get(str(det.track_id), {}).get("current_behaviour", None) if det.label == "calf" else None
                draw_detection(
                    frame=frame,
                    bbox=det.bbox,
                    label=det.label,
                    track_id=det.track_id,
                    behaviour=t_beh,
                    risk_level=t_risk,
                    confidence=det.confidence
                )

            draw_hud(
                frame=frame,
                sim_time_s=sim_seconds,
                real_time_s=real_time_s,
                active_calves_count=len(calves_data),
                alert_message=critical_alerts[0] if critical_alerts else None
            )

            writer.write(frame)
            cv2.imwrite(frame_preview_path, frame)

            # 6. One line per second console output
            now_mono = time.time()
            if now_mono - last_status_print >= 1.0:
                time_disp = f"[T={real_time_s:5.1f}s | Sim: {sim_minutes:5.1f}m]"
                line = " | ".join(status_items)
                alert_tag = " !! ALERT !!" if highest_risk == "HIGH" else ""
                print(f"{time_disp} {line}{alert_tag}")
                last_status_print = now_mono

            frame_idx += 1

    except KeyboardInterrupt:
        print("\n[CalfWatch AI] Processing interrupted by user.")
    finally:
        cap.release()
        writer.release()
        print(f"\n[Finished] Annotated video saved to: {out_video_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="CalfWatch AI — Newborn Calf Monitoring System")
    parser.add_argument("--video", type=str, default=None, help="Path to input video file or webcam index ('0')")
    parser.add_argument("--camera", nargs="?", const=0, type=int, default=None, help="Run live webcam/camera pipeline (e.g. --camera or --camera 0)")
    parser.add_argument("--demo", action="store_true", help="Run scripted demo mode with no video or neural net")
    parser.add_argument("--config", type=str, default="config.yaml", help="Path to configuration file")
    parser.add_argument("--speed", type=float, default=1.0, help="Demo playback speed multiplier")
    parser.add_argument("--frame-skip", type=int, default=None, help="Sample 1 in every N frames for faster CPU inference")
    parser.add_argument("--imgsz", type=int, default=None, help="YOLO inference resolution (e.g. 320 for ultra-fast, 480 balanced, 640 detail)")

    args = parser.parse_args()

    config = load_config(args.config)

    if args.camera is not None:
        run_video_pipeline(str(args.camera), config, frame_skip=args.frame_skip, imgsz=args.imgsz)
    elif args.demo:
        run_demo_pipeline(config, speed=args.speed)
    elif args.video:
        run_video_pipeline(args.video, config, frame_skip=args.frame_skip, imgsz=args.imgsz)
    else:
        print("No input specified; defaulting to --demo mode.")
        run_demo_pipeline(config, speed=args.speed)


if __name__ == "__main__":
    main()
