export interface SeatDef {
  id: string;
  seat_label: string;
  side: 'left' | 'right' | 'back';
}

const rowNumbers = [1, 2, 3, 4, 5, 6, 7, 8];

export const seatLayout: SeatDef[] = [
  ...rowNumbers.flatMap((row) => [
    { id: `${row}A`, seat_label: `Row ${row} Seat A`, side: 'left' as const },
    { id: `${row}B`, seat_label: `Row ${row} Seat B`, side: 'left' as const },
    { id: `${row}C`, seat_label: `Row ${row} Seat C`, side: 'right' as const },
    { id: `${row}D`, seat_label: `Row ${row} Seat D`, side: 'right' as const },
    { id: `${row}E`, seat_label: `Row ${row} Seat E`, side: 'right' as const },
  ]),
  { id: 'G1', seat_label: 'Back Row Seat 1', side: 'back' },
  { id: 'G2', seat_label: 'Back Row Seat 2', side: 'back' },
  { id: 'G3', seat_label: 'Back Row Seat 3', side: 'back' },
  { id: 'G4', seat_label: 'Back Row Seat 4', side: 'back' },
  { id: 'G5', seat_label: 'Back Row Seat 5', side: 'back' },
  { id: 'G6', seat_label: 'Back Row Seat 6', side: 'back' },
];
