#!/usr/bin/env node

/**
 * WellSense Device Simulator CLI Script
 * 
 * Simulates an IoT sensor console transmitting water quality telemetry.
 * Usage:
 *   node scripts/device-sim.js --url http://localhost:3000 --key <API_KEY> [--rain] [--fast]
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: 'http://localhost:3000',
    key: null,
    rain: false,
    fast: false,
    delay: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--url') {
      options.url = args[++i];
    } else if (arg.startsWith('--url=')) {
      options.url = arg.split('=')[1];
    } else if (arg === '--key') {
      options.key = args[++i];
    } else if (arg.startsWith('--key=')) {
      options.key = arg.split('=')[1];
    } else if (arg === '--rain') {
      options.rain = true;
    } else if (arg === '--fast') {
      options.fast = true;
    } else if (arg === '--delay') {
      options.delay = parseInt(args[++i], 10);
    }
  }

  return options;
}

function printUsage() {
  console.log(`
WellSense Device Simulator
Usage:
  node scripts/device-sim.js --url <URL> --key <API_KEY> [options]

Required:
  --key <KEY>         Console API Key (Bearer token)

Options:
  --url <URL>         Target server URL (default: http://localhost:3000)
  --rain              Inject a turbidity spike (15.0 NTU) at reading #50
  --fast              Send all 60 readings immediately with simulated timestamps
  --delay <ms>        Delay between readings in ms (default: 0 if --fast, 500 otherwise)
  -h, --help          Show this help message

Examples:
  node scripts/device-sim.js --key your_api_key_here --fast
  node scripts/device-sim.js --url http://localhost:3000 --key your_api_key_here --rain --fast
`);
}

function randomBetween(min, max, decimals = 2) {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(decimals));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const options = parseArgs();

  if (!options.key) {
    console.error('Error: Missing required --key argument.');
    printUsage();
    process.exit(1);
  }

  const endpoint = `${options.url.replace(/\/+$/, '')}/api/ingest`;
  const totalReadings = 60;
  const now = Date.now();
  const thirtyMinutesMs = 30 * 60 * 1000;
  const delayMs = options.delay !== null ? options.delay : (options.fast ? 10 : 500);

  console.log('====================================================');
  console.log('WellSense Sensor Device Simulator');
  console.log('====================================================');
  console.log(`Target URL:        ${endpoint}`);
  console.log(`API Key:           ${options.key.substring(0, 6)}...`);
  console.log(`Mode:              ${options.fast ? 'Fast (immediate)' : `Streaming (${delayMs}ms step)`}`);
  console.log(`Simulated Period:  Past 30 hours (60 readings at 30-min steps)`);
  console.log(`Rain Spike Event:  ${options.rain ? 'Enabled (reading #50)' : 'Disabled'}`);
  console.log('====================================================\n');

  let successCount = 0;
  let failCount = 0;
  const errors = [];
  let rainInjected = false;

  for (let i = 1; i <= totalReadings; i++) {
    // Simulated timestamp stepping forward every 30 minutes from 29.5 hours ago to now
    const readingTs = now - ((totalReadings - i) * thirtyMinutesMs);

    // Baseline readings:
    // pH ~7.2 (±0.1)
    let ph = randomBetween(7.1, 7.3, 2);
    // Turbidity ~2.0 (±0.3)
    let turb = randomBetween(1.7, 2.3, 2);
    // TDS ~180 (±5)
    let tds = randomBetween(175, 185, 1);
    // Temp ~27 (±0.5)
    let temp = randomBetween(26.5, 27.5, 1);
    // Battery starts at 95% and gradually decreases
    let battery = Number((95 - ((i - 1) * 0.05)).toFixed(1));

    let isRainReading = false;
    // With --rain flag: at reading #50 (after 48-reading learning phase), inject spike
    if (options.rain && i === 50) {
      turb = 15.0;
      isRainReading = true;
      rainInjected = true;
    }

    const payload = {
      ph,
      turb,
      tds,
      temp,
      battery,
      ts: readingTs
    };

    const dateStr = new Date(readingTs).toISOString().replace('T', ' ').substring(0, 19);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.key}`
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 201) {
        successCount++;
        const tag = isRainReading ? ' [RAIN SPIKE 15.0 NTU]' : '';
        console.log(`[${String(i).padStart(2, '0')}/${totalReadings}] ${dateStr} UTC -> pH: ${ph}, Turb: ${turb} NTU, TDS: ${tds} ppm, Temp: ${temp} C, Bat: ${battery}% -> 201 OK${tag}`);
      } else {
        failCount++;
        const errText = await response.text();
        const msg = `Reading #${i} failed: HTTP ${response.status} - ${errText}`;
        errors.push(msg);
        console.error(`[${String(i).padStart(2, '0')}/${totalReadings}] ${dateStr} UTC -> HTTP ${response.status}: ${errText}`);
      }
    } catch (err) {
      failCount++;
      const msg = `Reading #${i} network error: ${err.message}`;
      errors.push(msg);
      console.error(`[${String(i).padStart(2, '0')}/${totalReadings}] ${dateStr} UTC -> Network error: ${err.message}`);
    }

    if (delayMs > 0 && i < totalReadings) {
      await sleep(delayMs);
    }
  }

  console.log('\n====================================================');
  console.log('Simulation Summary');
  console.log('====================================================');
  console.log(`Total Readings Sent:  ${totalReadings}`);
  console.log(`Successful (201 OK):  ${successCount}`);
  console.log(`Failed:               ${failCount}`);
  console.log(`Rain Event Injected:  ${rainInjected ? 'Yes (reading #50 turbidity set to 15.0 NTU)' : 'No'}`);
  console.log(`Learning Phase Note:  Readings 1-48 establish baseline. Reading 50 tests alert detection.`);
  if (errors.length > 0) {
    console.log('\nEncountered Errors:');
    errors.slice(0, 10).forEach((err) => console.log(`  - ${err}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more.`);
    }
  }
  console.log('====================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal simulator error:', err);
  process.exit(1);
});
