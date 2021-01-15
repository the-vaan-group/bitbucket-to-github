import test from 'ava'
import { stripControlCharacters as s } from './strip-control-characters'

test('Strip Control Characters From String', async function (t) {
  t.is(s('\ba\x00b\n\rc\fd\xc3'), 'ab  cd')

  t.is(
    'Message:\r\n\r\n- ABC\r\n- BCA - XYZ',
    'Message: - ABC - BCA - XYZ',
    'should replace newline characters with spaces'
  )
})
