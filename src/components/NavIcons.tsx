type IconProps = {
  className?: string
}

export function IconCalendarMonth({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 -960 960 960" className={className} aria-hidden="true">
      <path
        d="M480-400q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-188.5-11.5Q280-423 280-440t11.5-28.5Q303-480 320-480t28.5 11.5Q360-457 360-440t-11.5 28.5Q337-400 320-400t-28.5-11.5ZM640-400q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-188.5-11.5Q280-263 280-280t11.5-28.5Q303-320 320-320t28.5 11.5Q360-297 360-280t-11.5 28.5Q337-240 320-240t-28.5-11.5ZM640-240q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconCalendarViewDay({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 -960 960 960" className={className} aria-hidden="true">
      <path
        d="M200-280q-33 0-56.5-23.5T120-360v-240q0-33 23.5-56.5T200-680h560q33 0 56.5 23.5T840-600v240q0 33-23.5 56.5T760-280H200Zm-80-480v-80h720v80H120Zm0 640v-80h720v80H120Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconCalendarWeek({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 -960 960 960" className={className} aria-hidden="true">
      <path
        d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-360h160v-200H160v200Zm240 0h160v-200H400v200Zm240 0h160v-200H640v200ZM320-240v-200H160v200h160Zm80 0h160v-200H400v200Zm240 0h160v-200H640v200Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IconPlus({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function IconChecklist({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M9 7h9M9 12h9M9 17h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.5 7.5 6 9l2.5-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 12.5 6 14l2.5-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="16" width="6" height="4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
