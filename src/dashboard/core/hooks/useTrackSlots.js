import { useMemo, useCallback } from "react";

export const useTrackSlots = (tracks, globalMappings, inputType, excludeTrackId = null) => {
  const usedSlots = useMemo(() => {
    return new Set(
      tracks
        .filter(t => !excludeTrackId || t.id !== excludeTrackId)
        .map(t => t.trackSlot)
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

  const getTrigger = useCallback((slot) => {
    return globalMappings?.trackMappings?.[inputType]?.[slot] ?? "";
  }, [globalMappings, inputType]);

  const isSlotAvailable = useCallback((slot) => {
    return availableSlots.includes(slot);
  }, [availableSlots]);

  return {
    usedSlots,
    availableSlots,
    getTrigger,
    isSlotAvailable,
  };
};

