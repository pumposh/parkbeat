export function maybeParseNumber(value: string | number) {
  let number: number;

  if (typeof value === 'string') {
    number = Number(value.replace(/[^0-9.-]+/g, ''))
  } else if (typeof value === 'number') {
    number = value
  } else {
    return 0
  }

  if (isNaN(number)) {
    return 0
  }

  return number
}

export function maybeParseFloat(value: string | number) {
  let number: number;
  if (typeof value === 'string') {
    number = Number(parseFloat(value.replace(/[^0-9.-]+/g, '')))
  } else if (typeof value === 'number') {
    number = value
  } else {
    return 0
  }

  if (isNaN(number)) {
    return 0
  }

  return number
}