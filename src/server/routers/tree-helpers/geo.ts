import { Project, ProjectGroup } from "@/hooks/use-tree-sockets";
import geohash from 'ngeohash';

type ProjectGroupingResult = {
  groups: ProjectGroup[];
  individualProjects: Project[];
}

// Constants for grouping logic
const DISTANCE_THRESHOLD = 0.01; // About 1km at the equator
const MIN_GROUP_SIZE = 3; // Minimum number of trees to form a group
const GROUP_PRECISION_THRESHOLD = 4; // Only group trees at precision 4 or lower

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Simple Euclidean distance - sufficient for small areas
  const x = (lng2 - lng1) * Math.cos((lat1 + lat2) / 2);
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y);
}

function findCentroid(trees: Project[]): { lat: number; lng: number } {
  const sum = trees.reduce((acc, tree) => ({
    lat: acc.lat + tree._loc_lat,
    lng: acc.lng + tree._loc_lng
  }), { lat: 0, lng: 0 });

  return {
    lat: sum.lat / trees.length,
    lng: sum.lng / trees.length
  };
}

export const getTreeGroupsViaPrecision = (trees: Project[], targetPrecision: string): ProjectGroupingResult => {
  const result: ProjectGroupingResult = {
    groups: [],
    individualProjects: []
  };
  
  if (!trees.length) return result;

  // If target precision is greater than threshold, return all trees individually
  if (targetPrecision.length > GROUP_PRECISION_THRESHOLD) {
    return {
      groups: [],
      individualProjects: trees
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

  let currentGroup: Project[] = [firstTree];
  let lastTree: Project = firstTree;
  let ungroupedProjects: Project[] = [];

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

    // Adjust distance threshold based on precision
    // Lower precision = larger groups allowed
    const adjustedThreshold = DISTANCE_THRESHOLD * Math.pow(2, GROUP_PRECISION_THRESHOLD - targetPrecision.length);

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
            state: "Unknown"
          });
        } else {
          // If group doesn't match target precision, add trees individually
          ungroupedProjects.push(...currentGroup);
        }
      } else {
        // Add small groups to ungrouped trees
        ungroupedProjects.push(...currentGroup);
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
        state: "Unknown"
      });
    } else {
      ungroupedProjects.push(...currentGroup);
    }
  } else {
    ungroupedProjects.push(...currentGroup);
  }

  // Add all ungrouped trees to the result
  result.individualProjects = ungroupedProjects;

  return result;
}

export const iterateLatLng = (lat: number, lng: number, direction: string, steps: number) => {
  const directions = {
    'N': { lat: -1, lng: 0 },
    'S': { lat: 1, lng: 0 },
    'E': { lat: 0, lng: 1 },
    'W': { lat: 0, lng: -1 }
  }
  console.log('direction', direction)
  console.log('steps', steps)
  console.log('directions', directions)

  const fuzzy = direction.split('')[0]?.toUpperCase() as keyof typeof directions
  console.log('fuzzy', fuzzy)
  const newLatLng = {
    lat: lat + directions[fuzzy]?.lat * steps,
    lng: lng + directions[fuzzy]?.lng * steps
  }
  console.log('newLatLng', newLatLng)

  return newLatLng
}