const easymidi = require('easymidi');
const path = require('path');
const { exec } = require('child_process');

// --- CONFIGURATION ---
const BPM = 120; // CHANGE THIS to match your song!
const MP3_FILE = path.join(__dirname, 'dashboard', 'assets', 'audio', 'first-test-audio-nw_visuals-1.MP3'); 
// To use your own song: Replace 'kick.mp3' above with your filename, 
// and make sure the file exists in src/dashboard/assets/audio/
// ---------------------

const BEAT_MS = 60000 / BPM;
const targetPortName = 'loopMIDI Port';

console.log(`\n🎵 THE HACKER BRIDGE 🎵`);
console.log(`Target BPM: ${BPM}`);
console.log(`Audio File: ${MP3_FILE}`);

// 1. MIDI Setup
const outputs = easymidi.getOutputs();
if (!outputs.includes(targetPortName)) {
    console.error(`❌ Error: "${targetPortName}" not found. Is loopMIDI running?`);
    process.exit(1);
}
const output = new easymidi.Output(targetPortName);
console.log(`✅ Connected to MIDI: ${targetPortName}`);

// 2. Helper Functions
function sendTrigger(channel, note, velocity = 127) {
    output.send('noteon', { note: note, velocity: velocity, channel: channel });
    setTimeout(() => {
        output.send('noteoff', { note: note, velocity: velocity, channel: channel });
    }, 100);
}

// 3. Start The Show
console.log('🚀 Launching Audio...');

// Open the default media player for the file (Windows specific)
// Using 'start' command to launch the file with the system's default player
exec(`start "" "${MP3_FILE}"`, (error) => {
    if (error) {
        console.error(`⚠️ Could not play audio: ${error.message}`);
        console.log('Continuing with MIDI only...');
    }
});

console.log('🥁 Starting MIDI Loops...');

// Loop 1: Pulse (UI Channel 2 / Note C#)
// MUST send on MIDI Channel 0 (which is Ch 1 in software)
let beatCount = 0;
const pulseInterval = setInterval(() => {
    sendTrigger(0, 'C#3'); // MIDI Ch 1, Note C#
    process.stdout.write('Pwom '); 
    beatCount++;
}, BEAT_MS);

// Loop 2: Red Mode (UI Channel 1 / Note C)
// MUST send on MIDI Channel 0 (which is Ch 1 in software)
const redInterval = setInterval(() => {
    sendTrigger(0, 'C3'); // MIDI Ch 1, Note C
    console.log('\n🔴 FLASH!');
}, BEAT_MS * 4);

// Stop after 3 minutes or Ctrl+C
setTimeout(() => {
    clearInterval(pulseInterval);
    clearInterval(redInterval);
    output.close();
    console.log('\n🏁 Show complete.');
    process.exit(0);
}, 180000); // 3 minutes
