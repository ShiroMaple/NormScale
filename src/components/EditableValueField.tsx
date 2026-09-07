'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface EditableValueFieldProps {
  value: string;
  onChange: (newValue: string) => void;
  id?: string;
  fieldId?: string;
  unit?: string;
  placeholder?: string;
  isHighlighted?: boolean;
  onHover?: () => void;
  onLeave?: () => void;
  align?: 'left' | 'right';
  className?: string;
  truncate?: boolean;
  title?: string;
}

/**
 * 步骤 2 专用：被提取值可交互编辑字段组件
 * 
 * - 默认态：常规纯文本加粗展示（主题色 #006194），无外层厚重输入框线框；
 * - 悬浮态：区域微弱底纹，右侧平滑淡入主题色编辑按钮；悬浮保留 PDF 切图 BBox 联动；
 * - 编辑态：点击编辑按钮变更为聚焦输入框，支持 Enter / 失焦自动保存，Esc 撤销还原。
 */
export const EditableValueField: React.FC<EditableValueFieldProps> = ({
  value,
  onChange,
  id,
  fieldId,
  unit,
  placeholder = '--',
  isHighlighted = false,
  onHover,
  onLeave,
  align = 'left',
  className = '',
  truncate = true,
  title,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [tempValue, setTempValue] = useState<string>(value || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // 当外部 value 变化且未处于编辑状态时，同步更新内部临时状态
  useEffect(() => {
    if (!isEditing) {
      setTempValue(value || '');
    }
  }, [value, isEditing]);

  // 进入编辑状态时自动聚焦并全选文本
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempValue(value || '');
    setIsEditing(true);
  };

  const handleCommit = () => {
    setIsEditing(false);
    if (tempValue !== (value || '')) {
      onChange(tempValue);
    }
  };

  const handleCancel = () => {
    setTempValue(value || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const elementId = id || (fieldId ? `right-field-${fieldId}` : undefined);

  // 1. 编辑状态
  if (isEditing) {
    return (
      <div
        id={elementId}
        className={`relative flex items-center w-full min-h-[28px] ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full text-xs font-bold rounded border px-2 py-0.5 border-primary ring-2 ring-primary/40 bg-surface-container-lowest dark:bg-surface-dark text-primary dark:text-primary-fixed-dim focus:outline-none transition-all ${
            align === 'right' ? 'text-right' : 'text-left'
          } ${unit ? 'pr-9' : ''}`}
        />
        {unit && (
          <span className="absolute right-2 text-xs font-normal text-outline-variant dark:text-outline-dark select-none pointer-events-none">
            {unit}
          </span>
        )}
      </div>
    );
  }

  const hasValue = Boolean(value && value.trim() !== '');

  // 2. 常规展示状态
  return (
    <div
      id={elementId}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      title={title || (hasValue ? value : placeholder)}
      className={`group relative flex items-center justify-between min-h-[28px] px-2 py-0.5 rounded transition-all cursor-pointer ${
        isHighlighted
          ? 'border border-primary ring-2 ring-primary/40 bg-primary/5 text-primary'
          : 'hover:bg-surface-container-high/40 dark:hover:bg-surface-dark-high/40'
      } ${className}`}
    >
      <div className={`flex items-center min-w-0 flex-1 overflow-hidden ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {hasValue ? (
          <span
            className={`text-xs font-bold text-primary dark:text-primary-fixed-dim ${
              truncate ? 'truncate' : ''
            }`}
          >
            {value}
          </span>
        ) : (
          <span className="text-xs text-outline-variant italic select-none">
            {placeholder}
          </span>
        )}
        {unit && hasValue && (
          <span className="text-xs font-normal text-outline-variant dark:text-outline-dark ml-1 shrink-0 select-none">
            {unit}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={handleStartEdit}
        title="点击编辑此项数据"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-primary hover:bg-primary/10 dark:text-primary-fixed-dim dark:hover:bg-primary-fixed-dim/20 ml-1.5 shrink-0 flex items-center justify-center cursor-pointer"
      >
        <span className="material-symbols-outlined text-[12px] leading-none">edit</span>
      </button>
    </div>
  );
};
