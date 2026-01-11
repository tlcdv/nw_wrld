const DEFAULT_INPUT_CONFIG = {
  type: "midi",
  deviceName: "IAC Driver Bus 1",
  trackSelectionChannel: 1,
  methodTriggerChannel: 2,
  velocitySensitive: false,
  port: 8000,
};

const DEFAULT_GLOBAL_MAPPINGS = {
  trackMappings: {
    midi: {
      1: 0,
      2: 1,
      3: 2,
      4: 3,
      5: 4,
      6: 5,
      7: 6,
      8: 7,
      9: 8,
      10: 9,
      11: 10,
      12: 11,
    },
    osc: {
      1: "/track/1",
      2: "/track/2",
      3: "/track/3",
      4: "/track/4",
      5: "/track/5",
      6: "/track/6",
      7: "/track/7",
      8: "/track/8",
      9: "/track/9",
      10: "/track/10",
    },
  },
  channelMappings: {
    midi: {
      1: 0,
      2: 1,
      3: 2,
      4: 3,
      5: 4,
      6: 5,
      7: 6,
      8: 7,
      9: 8,
      10: 9,
      11: 10,
      12: 11,
    },
    osc: {
      1: "/ch/1",
      2: "/ch/2",
      3: "/ch/3",
      4: "/ch/4",
      5: "/ch/5",
      6: "/ch/6",
      7: "/ch/7",
      8: "/ch/8",
      9: "/ch/9",
      10: "/ch/10",
      11: "/ch/11",
      12: "/ch/12",
    },
  },
};

const DEFAULT_USER_DATA = {
  config: {
    activeSetId: "set_1",
    activeTrackId: null,
    input: DEFAULT_INPUT_CONFIG,
    trackMappings: DEFAULT_GLOBAL_MAPPINGS.trackMappings,
    channelMappings: DEFAULT_GLOBAL_MAPPINGS.channelMappings,
    sequencerMode: true,
    sequencerBpm: 120,
  },
  sets: [
    {
      id: "set_1",
      name: "Set 1",
      tracks: [],
    },
  ],
};

module.exports = {
  DEFAULT_INPUT_CONFIG,
  DEFAULT_GLOBAL_MAPPINGS,
  DEFAULT_USER_DATA,
};
