import React from "react";
import { Button } from "./Button";

export const ModalHeader = ({
  title,
  onClose,
  isBottomAligned,
  showClose = true,
  uppercase = true,
  containerClassName = "",
  titleClassName = "",
}) => {
  return (
    <div className="mb-4 pb-4 border-b border-neutral-800 bg-[#101010]">
      <div
        className={`flex justify-between items-baseline ${
          isBottomAligned ? "px-6" : ""
        } ${containerClassName}`}
      >
        <span
          className={`${
            uppercase ? "uppercase" : "normal-case"
          } text-neutral-300 relative inline-block ${titleClassName}`}
        >
          {title}
        </span>
        {showClose ? (
          <Button onClick={onClose} type="secondary">
            CLOSE
          </Button>
        ) : null}
      </div>
    </div>
  );
};

ModalHeader.displayName = "ModalHeader";
