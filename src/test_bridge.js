const easymidi = require("easymidi");

// List all outputs to help debug if it fails
const outputs = easymidi.getOutputs();
console.log("Available MIDI Outputs:", outputs);

const targetPortName = "loopMIDI Port";

// Check if loopMIDI is available
if (!outputs.includes(targetPortName)) {
  console.error(`Error: Could not find "${targetPortName}". Please ensure loopMIDI is running.`);
  process.exit(1);
}

const output = new easymidi.Output(targetPortName);
console.log(`Connected to ${targetPortName}! Sending triggers...`);
console.log("------------------------------------------------");
console.log('Sending "Red Mode" (Note C) on Channel 1 every 2s');
console.log('Sending "Pulse" (Note C#) on Channel 2 every 500ms');
console.log("------------------------------------------------");
console.log("Script will run for 60 seconds then exit.");

// Helper to send note
function sendTrigger(channel, note, velocity = 127) {
  // Note On
  output.send("noteon", {
    note: note,
    velocity: velocity,
    channel: channel,
  });

  // Note Off (shortly after)
  setTimeout(() => {
    output.send("noteoff", {
      note: note,
      velocity: velocity,
      channel: channel,
    });
  }, 100);
}

// Loop 1: Pulse (Channel 2 -> index 1) - Note C# (Index 13 or just name 'C#3')
// easymidi accepts note names like 'C#3'
let pulseCount = 0;
const pulseInterval = setInterval(() => {
  sendTrigger(1, "C#3"); // Channel 2 (index 1)
  process.stdout.write("."); // visuals
  pulseCount++;
}, 500);

// Loop 2: Red Mode (Channel 1 -> index 0) - Note C (Index 12 or 'C3')
const redInterval = setInterval(() => {
  sendTrigger(0, "C3"); // Channel 1 (index 0)
  console.log("\n[TRIGGER] RED MODE!");
}, 2000);

// Stop after 60 seconds
setTimeout(() => {
  clearInterval(pulseInterval);
  clearInterval(redInterval);
  output.close();
  console.log("\nDone! Test complete.");
  process.exit(0);
}, 60000);
