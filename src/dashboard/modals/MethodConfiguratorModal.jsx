import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useAtom } from "jotai";
import { remove } from "lodash";
import { useIPCSend } from "../core/hooks/useIPC.js";
import { Modal } from "../shared/Modal.jsx";
import { ModalHeader } from "../components/ModalHeader.js";
import { SortableWrapper } from "../shared/SortableWrapper.jsx";
import { SortableList, arrayMove } from "../shared/SortableList.jsx";
import { horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ModalFooter } from "../components/ModalFooter.js";
import { Button } from "../components/Button.js";
import { Select } from "../components/FormInputs.js";
import { HelpIcon } from "../components/HelpIcon.js";
import { MethodBlock } from "../components/MethodBlock.js";
import { Tooltip } from "../components/Tooltip.js";
import { FaExclamationTriangle } from "react-icons/fa";
import {
  userDataAtom,
  selectedChannelAtom,
  activeSetIdAtom,
} from "../core/state.js";
import { updateActiveSet, getMethodsByLayer } from "../core/utils.js";
import { getActiveSetTracks } from "../../shared/utils/setUtils.js";
import { getBaseMethodNames } from "../utils/moduleUtils.js";
import { HELP_TEXT } from "../../shared/helpText.js";
import { MethodCodeModal } from "./MethodCodeModal.jsx";

const SortableItem = React.memo(
  ({
    id,
    method,
    handleRemoveMethod,
    changeOption,
    addMissingOption,
    moduleMethods,
    moduleName,
    onShowMethodCode,
  }) => {
    const toggleRandomization = useCallback(
      (optionName, currentValue) => {
        const option = method.options.find((o) => o.name === optionName);
        if (!option) return;

        if (option.randomRange) {
          changeOption(method.name, optionName, undefined, "randomRange");
        } else {
          const defaultVal =
            typeof option.defaultVal === "boolean"
              ? option.defaultVal
              : parseFloat(option.defaultVal);
          let min, max;
          if (typeof defaultVal === "boolean") {
            min = false;
            max = true;
          } else {
            min = Math.max(defaultVal * 0.8, 0);
            max = defaultVal * 1;
          }
          changeOption(method.name, optionName, [min, max], "randomRange");
        }
      },
      [method.name, method.options, changeOption]
    );

    const handleRandomChange = useCallback(
      (optionName, index, newValue) => {
        const option = method.options.find((o) => o.name === optionName);
        if (!option || !option.randomRange) return;

        let newRandomRange;
        if (option.type === "boolean") {
          newRandomRange = [...option.randomRange];
          newRandomRange[index] = newValue === "true";
        } else {
          newRandomRange = [...option.randomRange];
          newRandomRange[index] = parseFloat(newValue);
        }
        changeOption(method.name, optionName, newRandomRange, "randomRange");
      },
      [method.options, method.name, changeOption]
    );

    const handleOptionChange = useCallback(
      (methodName, optionName, value) => {
        changeOption(methodName, optionName, value);
      },
      [changeOption]
    );

    return (
      <SortableWrapper id={id} disabled={method.name === "matrix"}>
        {({ dragHandleProps, isDragging }) => (
          <>
            <div>
              <MethodBlock
                method={method}
                mode="dashboard"
                moduleMethods={moduleMethods}
                moduleName={moduleName}
                dragHandleProps={dragHandleProps}
                onRemove={handleRemoveMethod}
                onShowCode={onShowMethodCode}
                onOptionChange={handleOptionChange}
                onToggleRandom={toggleRandomization}
                onRandomRangeChange={handleRandomChange}
                onAddMissingOption={addMissingOption}
              />
            </div>

            {method.name === "matrix" && (
              <div className="h-auto flex items-center mx-2 text-neutral-800 text-lg font-mono">
                +
              </div>
            )}
          </>
        )}
      </SortableWrapper>
    );
  }
);

SortableItem.displayName = "SortableItem";

export const MethodConfiguratorModal = ({
  isOpen,
  onClose,
  predefinedModules,
  onEditChannel,
  onDeleteChannel,
  workspacePath = null,
  workspaceModuleFiles = [],
  workspaceModuleLoadFailures = [],
}) => {
  const [userData, setUserData] = useAtom(userDataAtom);
  const [selectedChannel] = useAtom(selectedChannelAtom);
  const [selectedMethodForCode, setSelectedMethodForCode] = useState(null);
  const sendToProjector = useIPCSend("dashboard-to-projector");
  const { moduleBase, threeBase } = useMemo(() => getBaseMethodNames(), []);

  const module = useMemo(() => {
    if (!selectedChannel) return null;
    return predefinedModules.find(
      (m) =>
        m.id === selectedChannel.moduleType ||
        m.name === selectedChannel.moduleType
    );
  }, [predefinedModules, selectedChannel]);

  const needsIntrospection =
    Boolean(selectedChannel?.moduleType) &&
    Boolean(module) &&
    (!Array.isArray(module.methods) || module.methods.length === 0);

  const selectedModuleType = selectedChannel?.moduleType || null;
  const isWorkspaceMode = Boolean(workspacePath);
  const workspaceFileSet = useMemo(() => {
    return new Set((workspaceModuleFiles || []).filter(Boolean));
  }, [workspaceModuleFiles]);
  const workspaceFailureSet = useMemo(() => {
    return new Set((workspaceModuleLoadFailures || []).filter(Boolean));
  }, [workspaceModuleLoadFailures]);
  const isFileMissing =
    isWorkspaceMode &&
    selectedModuleType &&
    !workspaceFileSet.has(selectedModuleType);
  const isLoadFailed =
    isWorkspaceMode &&
    selectedModuleType &&
    workspaceFileSet.has(selectedModuleType) &&
    workspaceFailureSet.has(selectedModuleType);
  const missingReasonText = isFileMissing
    ? `Module "${selectedModuleType}" was referenced by this track but "${selectedModuleType}.js" was not found in your workspace modules folder.`
    : isLoadFailed
    ? `Module "${selectedModuleType}.js" exists in your workspace but failed to load. Fix the module file (syntax/runtime error) and save to retry.`
    : `Module "${selectedModuleType}" is not available in the current workspace scan.`;

  const [activeSetId] = useAtom(activeSetIdAtom);

  useEffect(() => {
    if (!isOpen) return;
    if (!needsIntrospection) return;
    if (!selectedChannel?.moduleType) return;
    sendToProjector("module-introspect", {
      moduleId: selectedChannel.moduleType,
    });
  }, [
    isOpen,
    needsIntrospection,
    selectedChannel?.moduleType,
    sendToProjector,
  ]);

  const methodConfigs = useMemo(() => {
    if (!selectedChannel) return [];
    const tracks = getActiveSetTracks(userData, activeSetId);
    const track = tracks[selectedChannel.trackIndex];
    const moduleData = track?.modulesData[selectedChannel.instanceId] || {
      constructor: [],
      methods: {},
    };
    const channelKey = selectedChannel.isConstructor
      ? "constructor"
      : String(selectedChannel.channelNumber);
    const configs = selectedChannel.isConstructor
      ? moduleData.constructor
      : moduleData.methods[channelKey] || [];

    return configs;
  }, [userData, selectedChannel, activeSetId]);

  const changeOption = useCallback(
    (methodName, optionName, value, field = "value") => {
      if (!selectedChannel) return;
      updateActiveSet(setUserData, activeSetId, (activeSet) => {
        const channelKey = selectedChannel.isConstructor
          ? "constructor"
          : String(selectedChannel.channelNumber);
        const track = activeSet.tracks[selectedChannel.trackIndex];
        const methods = selectedChannel.isConstructor
          ? track.modulesData[selectedChannel.instanceId].constructor
          : track.modulesData[selectedChannel.instanceId].methods[channelKey];
        const method = methods.find((m) => m.name === methodName);
        if (method) {
          const option = method.options.find((o) => o.name === optionName);
          if (option) {
            option[field] = value;
          }
        }
      });
    },
    [selectedChannel, setUserData, activeSetId]
  );

  const addMethod = useCallback(
    (methodName) => {
      if (!selectedChannel || !module) return;
      const method = module.methods.find((m) => m.name === methodName);
      if (!method) return;

      const initializedMethod = {
        name: method.name,
        options: method?.options?.length
          ? method.options.map((opt) => ({
              name: opt.name,
              value: opt.defaultVal,
              defaultVal: opt.defaultVal,
            }))
          : null,
      };

      const channelKey = selectedChannel.isConstructor
        ? "constructor"
        : String(selectedChannel.channelNumber);

      updateActiveSet(setUserData, activeSetId, (activeSet) => {
        const track = activeSet.tracks[selectedChannel.trackIndex];
        const insertMethod = methodName === "matrix" ? "unshift" : "push";

        if (selectedChannel.isConstructor) {
          track.modulesData[selectedChannel.instanceId].constructor[
            insertMethod
          ](initializedMethod);
        } else {
          if (
            !track.modulesData[selectedChannel.instanceId].methods[channelKey]
          ) {
            track.modulesData[selectedChannel.instanceId].methods[channelKey] =
              [];
          }
          track.modulesData[selectedChannel.instanceId].methods[channelKey][
            insertMethod
          ](initializedMethod);
        }
      });
    },
    [module, selectedChannel, setUserData, activeSetId]
  );

  const removeMethod = useCallback(
    (methodName) => {
      if (!selectedChannel) return;
      updateActiveSet(setUserData, activeSetId, (activeSet) => {
        const channelKey = selectedChannel.isConstructor
          ? "constructor"
          : String(selectedChannel.channelNumber);
        const track = activeSet.tracks[selectedChannel.trackIndex];
        const methods = selectedChannel.isConstructor
          ? track.modulesData[selectedChannel.instanceId].constructor
          : track.modulesData[selectedChannel.instanceId].methods[channelKey];
        remove(methods, (m) => m.name === methodName);
      });
    },
    [selectedChannel, setUserData, activeSetId]
  );

  const addMissingOption = useCallback(
    (methodName, optionName) => {
      if (!selectedChannel || !module) return;
      const methodDef = module.methods.find((m) => m.name === methodName);
      if (!methodDef) return;
      const optionDef = methodDef.options?.find((o) => o.name === optionName);
      if (!optionDef) return;

      updateActiveSet(setUserData, activeSetId, (activeSet) => {
        const track = activeSet.tracks[selectedChannel.trackIndex];
        const channelKey = selectedChannel.isConstructor
          ? "constructor"
          : String(selectedChannel.channelNumber);
        const methods = selectedChannel.isConstructor
          ? track.modulesData[selectedChannel.instanceId].constructor
          : track.modulesData[selectedChannel.instanceId].methods[channelKey];
        const method = methods.find((m) => m.name === methodName);
        if (method && !method.options.find((o) => o.name === optionName)) {
          if (!method.options) {
            method.options = [];
          }
          method.options.push({
            name: optionName,
            value: optionDef.defaultVal,
          });
        }
      });
    },
    [module, selectedChannel, setUserData, activeSetId]
  );

  const methodLayers = useMemo(() => {
    if (!module) return [];
    return getMethodsByLayer(module, moduleBase, threeBase);
  }, [module, moduleBase, threeBase]);

  const availableMethods = useMemo(() => {
    if (!module || !module.methods) return [];
    return module.methods.filter(
      (m) => !methodConfigs.some((mc) => mc.name === m.name)
    );
  }, [methodConfigs, module]);

  const methodsByLayer = useMemo(() => {
    const layersWithMethods = methodLayers.map((layer) => {
      const layerMethods = methodConfigs.filter((method) =>
        layer.methods.includes(method.name)
      );
      return {
        ...layer,
        configuredMethods: layerMethods,
        availableMethods: availableMethods.filter((m) =>
          layer.methods.includes(m.name)
        ),
      };
    });
    return layersWithMethods;
  }, [methodLayers, methodConfigs, availableMethods]);

  if (!isOpen || !selectedChannel) return null;
  if (!module && !isWorkspaceMode) return null;

  const modalTitle = (
    <>
      {module ? module.name : selectedChannel.moduleType}{" "}
      {selectedChannel.isConstructor
        ? "(Constructor)"
        : `(Channel ${selectedChannel.channelNumber})`}
      {!module && isWorkspaceMode ? (
        <span className="ml-2 inline-flex items-center">
          <Tooltip content={missingReasonText} position="top">
            <span className="text-red-500/70 text-[11px] cursor-help">
              <FaExclamationTriangle />
            </span>
          </Tooltip>
        </span>
      ) : null}
      {selectedChannel.isConstructor ? (
        <HelpIcon helpText={HELP_TEXT.constructor} />
      ) : (
        <HelpIcon helpText={HELP_TEXT.midiChannel} />
      )}
    </>
  );

  if (!module && isWorkspaceMode) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} position="bottom" size="full">
        <ModalHeader title={modalTitle} onClose={onClose} />
        <div className="px-6 py-6">
          <div className="text-neutral-300/70 text-[11px] font-mono">
            {missingReasonText}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} position="bottom" size="full">
        <ModalHeader title={modalTitle} onClose={onClose} />

        <div className="flex flex-col gap-6">
          {methodsByLayer.map((layer, layerIndex) => {
            const hasMethodsOrAvailable =
              layer.configuredMethods.length > 0 ||
              layer.availableMethods.length > 0;

            if (!hasMethodsOrAvailable) return null;

            return (
              <div key={layer.name} className="px-6 mb-6 border-neutral-800">
                <div className="flex justify-between items-baseline mb-4">
                  <div className="uppercase text-neutral-300 text-[11px] relative inline-block">
                    {layer.name} Methods
                  </div>
                  <div className="relative">
                    <Select
                      onChange={(e) => {
                        addMethod(e.target.value);
                        e.target.value = "";
                      }}
                      className="py-1 px-2 min-w-[150px]"
                      defaultValue=""
                      disabled={layer.availableMethods.length === 0}
                      style={{
                        opacity: layer.availableMethods.length === 0 ? 0.5 : 1,
                        cursor:
                          layer.availableMethods.length === 0
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      <option value="" disabled className="text-neutral-300/30">
                        add method
                      </option>
                      {layer.availableMethods.map((method) => (
                        <option
                          key={method.name}
                          value={method.name}
                          className="bg-[#101010]"
                        >
                          {method.name}
                        </option>
                      ))}
                    </Select>
                    <HelpIcon helpText={HELP_TEXT.methods} />
                  </div>
                </div>

                {layer.configuredMethods.length > 0 ? (
                  <SortableList
                    items={layer.configuredMethods}
                    strategy={horizontalListSortingStrategy}
                    onReorder={(oldIndex, newIndex) => {
                      if (!selectedChannel) return;

                      const currentLayer = layer;
                      if (!currentLayer) return;

                      updateActiveSet(setUserData, activeSetId, (activeSet) => {
                        const channelKey = selectedChannel.isConstructor
                          ? "constructor"
                          : String(selectedChannel.channelNumber);
                        const track =
                          activeSet.tracks[selectedChannel.trackIndex];
                        const methods = selectedChannel.isConstructor
                          ? track.modulesData[selectedChannel.instanceId]
                              .constructor
                          : track.modulesData[selectedChannel.instanceId]
                              .methods[channelKey];

                        const reorderedLayer = arrayMove(
                          currentLayer.configuredMethods,
                          oldIndex,
                          newIndex
                        );

                        const allReorderedMethods = methodsByLayer.reduce(
                          (acc, l) => {
                            if (l.name === currentLayer.name) {
                              return [...acc, ...reorderedLayer];
                            } else {
                              return [...acc, ...l.configuredMethods];
                            }
                          },
                          []
                        );

                        if (selectedChannel.isConstructor) {
                          track.modulesData[
                            selectedChannel.instanceId
                          ].constructor = allReorderedMethods;
                        } else {
                          track.modulesData[selectedChannel.instanceId].methods[
                            channelKey
                          ] = allReorderedMethods;
                        }
                      });
                    }}
                  >
                    <div className="flex items-start overflow-x-auto pt-4">
                      {layer.configuredMethods.map((method, methodIndex) => (
                        <React.Fragment key={method.name}>
                          <SortableItem
                            id={method.name}
                            method={method}
                            handleRemoveMethod={removeMethod}
                            changeOption={changeOption}
                            addMissingOption={addMissingOption}
                            moduleMethods={module ? module.methods : []}
                            moduleName={module ? module.name : null}
                            onShowMethodCode={(methodName) => {
                              setSelectedMethodForCode({
                                moduleName: module?.id || module?.name || null,
                                methodName,
                              });
                            }}
                          />
                          {methodIndex < layer.configuredMethods.length - 1 && (
                            <div className="flex-shrink-0 flex items-center w-4 min-h-[40px]">
                              <div className="w-full h-px bg-neutral-800" />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </SortableList>
                ) : (
                  <div className="text-neutral-500 text-[10px]">
                    No methods added to {layer.name} layer.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!selectedChannel?.isConstructor &&
          (onEditChannel || onDeleteChannel) && (
            <ModalFooter>
              {onEditChannel && (
                <Button
                  onClick={() => {
                    onEditChannel(selectedChannel.channelNumber);
                    onClose();
                  }}
                  type="secondary"
                  className="text-[11px]"
                >
                  EDIT CHANNEL
                </Button>
              )}
              {onDeleteChannel && (
                <Button
                  onClick={() => {
                    onDeleteChannel(selectedChannel.channelNumber);
                    onClose();
                  }}
                  type="secondary"
                  className="text-[11px]"
                >
                  DELETE CHANNEL
                </Button>
              )}
            </ModalFooter>
          )}
      </Modal>

      <MethodCodeModal
        isOpen={!!selectedMethodForCode}
        onClose={() => setSelectedMethodForCode(null)}
        moduleName={selectedMethodForCode?.moduleName}
        methodName={selectedMethodForCode?.methodName}
      />
    </>
  );
};
