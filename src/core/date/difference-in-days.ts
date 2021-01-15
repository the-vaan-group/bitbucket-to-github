import { parseJSON, differenceInCalendarDays } from 'date-fns'

export const calcDifferenceInDays = function (
  left: Date | string,
  right: Date | string = new Date()
): number {
  return Math.abs(differenceInCalendarDays(parseJSON(left), parseJSON(right)))
}
