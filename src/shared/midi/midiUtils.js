// Shared MIDI utilities

export const MIDI_INPUT_NAME = "IAC Driver Bus 1";

// Legacy channel notes mapping for MIDI file parsing: E7 to G8 → ch1 to ch16
// Note: These ch1-ch16 values are only used when parsing MIDI files for visualization
export const CHANNEL_NOTES = {
  G8: "ch1",
  "F#8": "ch2",
  F8: "ch3",
  E8: "ch4",
  "D#8": "ch5",
  D8: "ch6",
  "C#8": "ch7",
  C8: "ch8",
  B7: "ch9",
  "A#7": "ch10",
  A7: "ch11",
  "G#7": "ch12",
  G7: "ch13",
  "F#7": "ch14",
  F7: "ch15",
  E7: "ch16",
};

// Reverse mapping: channel → note name
export const NOTE_TO_CHANNEL = Object.fromEntries(
  Object.entries(CHANNEL_NOTES).map(([note, channel]) => [channel, note])
);

// MIDI Utility Functions
export const NOTE_OFFSETS = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const PITCH_CLASS_NAMES_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function noteNumberToPitchClass(noteNumber) {
  if (typeof noteNumber !== "number" || Number.isNaN(noteNumber)) return null;
  const n = Math.trunc(noteNumber);
  if (n < 0 || n > 127) return null;
  return ((n % 12) + 12) % 12;
}

export function pitchClassToName(pitchClass) {
  if (typeof pitchClass !== "number" || Number.isNaN(pitchClass)) return null;
  const pc = Math.trunc(pitchClass);
  if (pc < 0 || pc > 11) return null;
  return PITCH_CLASS_NAMES_SHARP[pc] || null;
}

export function noteNameToPitchClass(noteName) {
  if (typeof noteName !== "string") return null;
  const trimmed = noteName.trim();
  if (!trimmed) return null;
  // Accept "G", "G#", "Gb", "G7", "G#7", "Gb7" (octave ignored if present)
  const match = trimmed.match(/^([A-G](?:#|b)?)(?:-?\d+)?$/);
  if (!match) return null;
  const note = match[1];
  const semitone = NOTE_OFFSETS[note];
  if (semitone === undefined) return null;
  return semitone;
}

export function parsePitchClass(input) {
  if (typeof input === "number") {
    const pc = Math.trunc(input);
    return pc >= 0 && pc <= 11 ? pc : null;
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Numeric pitch class (0..11)
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 && n <= 11 ? n : null;
  }
  return noteNameToPitchClass(trimmed);
}

export function noteNameToNumber(noteName) {
  if (typeof noteName !== "string") return null;
  const match = noteName.trim().match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (!match) return null;
  const note = match[1];
  const octave = parseInt(match[2], 10);
  const semitone = NOTE_OFFSETS[note];
  if (semitone === undefined || Number.isNaN(octave)) return null;
  // Ableton uses C0 = MIDI 24 (not MIDI 12)
  // So we need (octave + 2) * 12 to match Ableton's octave notation
  return (octave + 2) * 12 + semitone;
}

export function buildChannelNotesMap() {
  const map = {};
  Object.entries(CHANNEL_NOTES).forEach(([noteName, channelName]) => {
    const num = noteNameToNumber(noteName);
    if (num !== null) map[num] = channelName;
  });
  return map;
}

export function resolveTrackTrigger(track, inputType, globalMappings) {
  if (track?.trackSlot && globalMappings?.trackMappings?.[inputType]) {
    return globalMappings.trackMappings[inputType][track.trackSlot];
  }
  return track?.trackTrigger || track?.trackNote || "";
}

export function resolveChannelTrigger(channelSlot, inputType, globalMappings) {
  if (channelSlot && globalMappings?.channelMappings?.[inputType]) {
    return globalMappings.channelMappings[inputType][channelSlot];
  }
  return "";
}

export function buildTrackNotesMapFromTracks(
  tracks,
  globalMappings,
  currentInputType = "midi"
) {
  const map = {};
  if (!Array.isArray(tracks)) {
    return map;
  }

  tracks.forEach((track) => {
    const trackTrigger = resolveTrackTrigger(
      track,
      currentInputType,
      globalMappings
    );

    if (
      track &&
      trackTrigger !== "" &&
      trackTrigger !== null &&
      trackTrigger !== undefined &&
      track.id &&
      currentInputType === "midi"
    ) {
      const pc = parsePitchClass(trackTrigger);
      if (pc !== null) map[pc] = track.id;
    }
  });

  return map;
}

export function buildMidiConfig(
  userData,
  globalMappings,
  currentInputType = "midi"
) {
  const config = {
    trackTriggersMap: {},
    channelMappings: {},
  };

  if (!userData || !Array.isArray(userData)) {
    return config;
  }

  userData.forEach((track) => {
    const trackTrigger = resolveTrackTrigger(
      track,
      currentInputType,
      globalMappings
    );

    // Build track triggers map
    if (
      track.name &&
      trackTrigger !== "" &&
      trackTrigger !== null &&
      trackTrigger !== undefined
    ) {
      if (currentInputType === "midi") {
        const pc = parsePitchClass(trackTrigger);
        if (pc !== null) config.trackTriggersMap[pc] = track.name;
      } else {
        config.trackTriggersMap[trackTrigger] = track.name;
      }
    }

    // Build channel mappings for this track (trigger → array of channel numbers)
    if (track.channelMappings) {
      config.channelMappings[track.name] = {};

      Object.entries(track.channelMappings).forEach(
        ([channelNumber, slotOrTrigger]) => {
          const channelTrigger =
            typeof slotOrTrigger === "number"
              ? resolveChannelTrigger(
                  slotOrTrigger,
                  currentInputType,
                  globalMappings
                )
              : slotOrTrigger;

          if (
            channelTrigger !== "" &&
            channelTrigger !== null &&
            channelTrigger !== undefined
          ) {
            let key = channelTrigger;
            if (currentInputType === "midi") {
              const pc = parsePitchClass(channelTrigger);
              if (pc !== null) key = pc;
              else return;
            }

            if (!config.channelMappings[track.name][key]) {
              config.channelMappings[track.name][key] = [];
            }
            config.channelMappings[track.name][key].push(channelNumber);
          }
        }
      );
    }
  });

  return config;
}
