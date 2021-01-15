import test from 'ava'

import { calcDifferenceInDays as diff } from './difference-in-days'

test('Difference In Days date helper', async function (t) {
  t.is(
    diff('2020-01-01T05:20:10.123Z', '2020-02-28T00:00:00.000Z'),
    30 + 28,
    'should return absolute number of days'
  )
})
