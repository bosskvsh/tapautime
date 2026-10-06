import React, { useState, useEffect } from 'react';

interface PreorderDateTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadTimeDays: number;
  onConfirm: (date: string, time: string) => void;
}

const TIME_OPTIONS = [
  '12pm-1pm',
  '1pm-2pm',
  '2pm-3pm',
  '3pm-4pm',
  '5pm-6pm'
];

export const PreorderDateTimeModal: React.FC<PreorderDateTimeModalProps> = ({
  isOpen,
  onClose,
  leadTimeDays,
  onConfirm,
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  // Calculate the minimum date based on lead_time_days
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + (leadTimeDays || 0));
  const minDateString = minDate.toISOString().split('T')[0];

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(minDateString);
      setSelectedTime(TIME_OPTIONS[0]); // Default to first available slot
    }
  }, [isOpen, minDateString]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedDate && selectedTime) {
      onConfirm(selectedDate, selectedTime);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-stone-900 text-stone-100 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,24px))] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-4 duration-300 border border-stone-800"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-white tracking-tight">Schedule Tapau Ahead</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-700 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-bold text-stone-400">Pickup Date</label>
            <input 
              type="date"
              min={minDateString}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-3.5 text-white font-medium focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange color-scheme-dark"
              style={{ colorScheme: 'dark' }}
            />
            {leadTimeDays > 0 && (
              <p className="text-xs text-stone-500 font-medium mt-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-brand-orange">info</span>
                This item requires at least {leadTimeDays} {leadTimeDays === 1 ? 'day' : 'days'} lead time.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-stone-400">Pickup Time</label>
            <select
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-3.5 text-white font-medium appearance-none focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                backgroundSize: '16px'
              }}
            >
              <option value="" disabled>Select a time</option>
              {TIME_OPTIONS.map(time => (
                  <option key={time} value={time}>
                    {time}
                  </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={handleConfirm}
            disabled={!selectedDate || !selectedTime}
            className="w-full bg-brand-orange hover:bg-[#d04b06] disabled:bg-stone-800 disabled:text-stone-500 text-white font-black py-4 rounded-2xl active:scale-[0.98] transition-all"
          >
            Confirm Time
          </button>
        </div>
      </div>
    </div>
  );
};
