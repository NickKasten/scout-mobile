export interface DeviceDimensions {
  width: number
  height: number
}

const DEVICE_DIMENSIONS: Record<string, DeviceDimensions> = {
  // iPhone SE series
  'iPhone SE': { width: 375, height: 667 },
  'iPhone SE (2nd generation)': { width: 375, height: 667 },
  'iPhone SE (3rd generation)': { width: 375, height: 667 },

  // iPhone mini
  'iPhone 12 mini': { width: 375, height: 812 },
  'iPhone 13 mini': { width: 375, height: 812 },

  // iPhone standard (6.1")
  'iPhone 12': { width: 390, height: 844 },
  'iPhone 13': { width: 390, height: 844 },
  'iPhone 14': { width: 390, height: 844 },
  'iPhone 15': { width: 393, height: 852 },
  'iPhone 16': { width: 393, height: 852 },
  'iPhone 17 Air': { width: 393, height: 852 },

  // iPhone Pro (6.1" / 6.3")
  'iPhone 12 Pro': { width: 390, height: 844 },
  'iPhone 13 Pro': { width: 390, height: 844 },
  'iPhone 14 Pro': { width: 393, height: 852 },
  'iPhone 15 Pro': { width: 393, height: 852 },
  'iPhone 16 Pro': { width: 402, height: 874 },
  'iPhone 17 Pro': { width: 402, height: 874 },

  // iPhone Pro Max / Plus (6.7" / 6.9")
  'iPhone 12 Pro Max': { width: 428, height: 926 },
  'iPhone 13 Pro Max': { width: 428, height: 926 },
  'iPhone 14 Plus': { width: 428, height: 926 },
  'iPhone 14 Pro Max': { width: 430, height: 932 },
  'iPhone 15 Plus': { width: 430, height: 932 },
  'iPhone 15 Pro Max': { width: 430, height: 932 },
  'iPhone 16 Plus': { width: 430, height: 932 },
  'iPhone 16 Pro Max': { width: 440, height: 956 },
  'iPhone 17 Pro Max': { width: 440, height: 956 },

  // iPad (standard)
  'iPad (10th generation)': { width: 820, height: 1180 },
  'iPad mini (6th generation)': { width: 744, height: 1133 },
  'iPad Air (5th generation)': { width: 820, height: 1180 },
  'iPad Air 11-inch (M2)': { width: 820, height: 1180 },
  'iPad Air 13-inch (M2)': { width: 1024, height: 1366 },
  'iPad Pro 11-inch (M4)': { width: 834, height: 1194 },
  'iPad Pro 13-inch (M4)': { width: 1024, height: 1366 },
}

/**
 * Look up logical point dimensions for a simulator device name.
 * Uses longest-substring match so "iPhone 17 Pro" matches even if the
 * simulator reports "iPhone 17 Pro (18.0)" or similar.
 */
export function lookupDimensions(deviceName: string): DeviceDimensions | undefined {
  // Try exact match first
  if (DEVICE_DIMENSIONS[deviceName]) {
    return DEVICE_DIMENSIONS[deviceName]
  }

  // Longest-substring match: find the longest key that is contained in deviceName
  let bestMatch: string | undefined
  let bestLength = 0

  for (const key of Object.keys(DEVICE_DIMENSIONS)) {
    if (deviceName.includes(key) && key.length > bestLength) {
      bestMatch = key
      bestLength = key.length
    }
  }

  return bestMatch ? DEVICE_DIMENSIONS[bestMatch] : undefined
}
