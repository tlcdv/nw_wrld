import {
  loadJsonFile,
  saveJsonFile,
  saveJsonFileSync,
} from "./jsonFileBase.js";

export const loadRecordingData = async () => {
  const data = await loadJsonFile(
    "recordingData.json",
    { recordings: {} },
    "Could not load recordingData.json, initializing with empty data."
  );
  return data.recordings || {};
};

export const saveRecordingData = (recordings) =>
  saveJsonFile("recordingData.json", { recordings });

export const saveRecordingDataSync = (recordings) =>
  saveJsonFileSync("recordingData.json", { recordings });

export const getRecordingForTrack = (recordings, trackId) => {
  return recordings[trackId] || { channels: [] };
};

export const setRecordingForTrack = (recordings, trackId, recording) => {
  return {
    ...recordings,
    [trackId]: recording,
  };
};

export const getSequencerForTrack = (recordings, trackId) => {
  return recordings[trackId]?.sequencer || { bpm: 120, pattern: {} };
};

export const setSequencerForTrack = (recordings, trackId, sequencer) => {
  return {
    ...recordings,
    [trackId]: {
      ...recordings[trackId],
      sequencer,
    },
  };
};

export const deleteRecordingsForTracks = (recordings, trackIds) => {
  const updated = { ...recordings };
  trackIds.forEach((trackId) => {
    delete updated[trackId];
  });
  return updated;
};
