import { useMemo, useCallback } from "react";

export const useTrackSlots = (
  tracks,
  globalMappings,
  inputType,
  excludeTrackId = null
) => {
  const usedSlots = useMemo(() => {
    return new Set(
      tracks
        .filter((t) => !excludeTrackId || t.id !== excludeTrackId)
        .map((t) => t.trackSlot)
        .filter(Boolean)
    );
  }, [tracks, excludeTrackId]);

  const availableSlots = useMemo(() => {
    const maxSlots = inputType === "midi" ? 12 : 10;
    const slots = [];
    for (let i = 1; i <= maxSlots; i++) {
      if (!usedSlots.has(i)) {
        slots.push(i);
      }
    }
    return slots;
  }, [usedSlots, inputType]);

  const getTrigger = useCallback(
    (slot) => {
      if (!slot) return "";
      if (inputType === "midi") {
        const mode =
          globalMappings?.input?.noteMatchMode === "exactNote"
            ? "exactNote"
            : "pitchClass";
        const midiMappings = globalMappings?.trackMappings?.midi;
        const byMode = midiMappings?.[mode];
        if (byMode && typeof byMode === "object") {
          return byMode?.[slot] ?? "";
        }
        if (midiMappings && typeof midiMappings === "object") {
          return midiMappings?.[slot] ?? "";
        }
        return "";
      }
      return globalMappings?.trackMappings?.[inputType]?.[slot] ?? "";
    },
    [globalMappings, inputType]
  );

  const isSlotAvailable = useCallback(
    (slot) => {
      return availableSlots.includes(slot);
    },
    [availableSlots]
  );

  return {
    usedSlots,
    availableSlots,
    getTrigger,
    isSlotAvailable,
  };
};
