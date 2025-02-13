import { Tree } from "@/hooks/use-tree-sockets";
import geohash from 'ngeohash';

export type BaseTreeGroup = {
  id: string
  count: number
  _loc_lat: number
  _loc_lng: number
  city: string
  state: string
  treeIds: string[]
}

export type TreeGroup = Omit<BaseTreeGroup, 'treeIds'> & {
  treeIds: Set<string>
}

export type TreeGroupingResult = {
  groups: BaseTreeGroup[];
  individualTrees: Tree[];
}

// Constants for grouping logic
const BASE_DISTANCE_THRESHOLD = 0.01; // About 1km at the equator
const MIN_GROUP_SIZE = 3; // Minimum number of trees to form a group
const GROUP_PRECISION_THRESHOLD = 4; // Only group trees at precision 4 or lower

// Approximate error (km) for different geohash precisions:
// 1: ±2500km
// 2: ±630km
// 3: ±78km
// 4: ±20km
// 5: ±2.4km
// 6: ±0.61km
// 7: ±0.076km
// 8: ±0.019km

function getDistanceThresholdForPrecision(precision: number): number {
  // Base multiplier for each precision level
  // We use an exponential scale that roughly matches geohash precision error margins
  const multiplier = Math.pow(4, GROUP_PRECISION_THRESHOLD - precision);
  
  // Add a small buffer to ensure we catch trees that are just on the edge
  const buffer = 1.2;
  
  return BASE_DISTANCE_THRESHOLD * multiplier * buffer;
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Simple Euclidean distance - sufficient for small areas
  const x = (lng2 - lng1) * Math.cos((lat1 + lat2) / 2);
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y);
}

function findCentroid(trees: Tree[]): { lat: number; lng: number } {
  const sum = trees.reduce((acc, tree) => ({
    lat: acc.lat + tree._loc_lat,
    lng: acc.lng + tree._loc_lng
  }), { lat: 0, lng: 0 });

  return {
    lat: sum.lat / trees.length,
    lng: sum.lng / trees.length
  };
}

export const getTreeGroupsViaPrecision = (trees: Tree[], targetPrecision: string): TreeGroupingResult => {
  const result: TreeGroupingResult = {
    groups: [],
    individualTrees: []
  };
  
  if (!trees.length) return result;

  // If target precision is greater than threshold, return all trees individually
  if (targetPrecision.length > GROUP_PRECISION_THRESHOLD) {
    return {
      groups: [],
      individualTrees: trees
    };
  }

  // Sort trees by geohash to ensure proximity in processing
  const sortedTrees = [...trees].sort((a, b) => {
    const hashA = geohash.encode(a._loc_lat, a._loc_lng);
    const hashB = geohash.encode(b._loc_lat, b._loc_lng);
    return hashB.localeCompare(hashA);
  });

  // Initialize with first tree
  const firstTree = sortedTrees[0];
  if (!firstTree) return result;

  let currentGroup: Tree[] = [firstTree];
  let lastTree: Tree = firstTree;
  let ungroupedTrees: Tree[] = [];

  // Group trees based on proximity
  for (let i = 1; i < sortedTrees.length; i++) {
    const currentTree = sortedTrees[i];
    if (!currentTree) continue;

    const distance = calculateDistance(
      lastTree._loc_lat,
      lastTree._loc_lng,
      currentTree._loc_lat,
      currentTree._loc_lng
    );

    // Get appropriate distance threshold for current precision
    const adjustedThreshold = getDistanceThresholdForPrecision(targetPrecision.length);

    if (distance <= adjustedThreshold) {
      currentGroup.push(currentTree);
    } else {
      // Process the current group if it's large enough
      if (currentGroup.length >= MIN_GROUP_SIZE) {
        const centroid = findCentroid(currentGroup);
        const groupHash = geohash.encode(centroid.lat, centroid.lng);
        
        // Only create groups at the target precision level
        if (groupHash.startsWith(targetPrecision)) {
          result.groups.push({
            id: `group_${groupHash}`,
            count: currentGroup.length,
            _loc_lat: centroid.lat,
            _loc_lng: centroid.lng,
            city: "Unknown",
            state: "Unknown",
            treeIds: currentGroup.map(tree => tree.id)
          });
        } else {
          // If group doesn't match target precision, add trees individually
          ungroupedTrees.push(...currentGroup);
        }
      } else {
        // Add small groups to ungrouped trees
        ungroupedTrees.push(...currentGroup);
      }
      
      // Start a new group
      currentGroup = [currentTree];
    }
    
    lastTree = currentTree;
  }

  // Process the last group
  if (currentGroup.length >= MIN_GROUP_SIZE) {
    const centroid = findCentroid(currentGroup);
    const groupHash = geohash.encode(centroid.lat, centroid.lng);
    
    if (groupHash.startsWith(targetPrecision)) {
      result.groups.push({
        id: `group_${groupHash}`,
        count: currentGroup.length,
        _loc_lat: centroid.lat,
        _loc_lng: centroid.lng,
        city: "Unknown",
        state: "Unknown",
        treeIds: currentGroup.map(tree => tree.id)
      });
    } else {
      ungroupedTrees.push(...currentGroup);
    }
  } else {
    ungroupedTrees.push(...currentGroup);
  }

  // Add all ungrouped trees to the result
  result.individualTrees = ungroupedTrees;

  return result;
}