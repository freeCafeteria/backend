export const isTimeInRange = (timeRange, targetTime) => {
  const startTime = convertToHour(timeRange[0]);
  const endTime = convertToHour(timeRange[1]);
  const target = convertToHour(targetTime);

  return target >= startTime && target <= endTime;
};

export const convertToHour = (time) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour + minute / 60;
};

const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // 지구 반지름 (단위: km)
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // 두 지점 사이의 거리 (단위: km)
  return distance;
};

export const findNearestFacilities = (
  data,
  userLatitude,
  userLongitude,
  numFacilities = 30
) => {
  // 거리를 기준으로 정렬할 배열
  let sortedFacilities = [];

  // 데이터를 순회하며 거리 계산 및 정렬 배열에 추가
  data.forEach((facility) => {
    const facilityLatitude = Number(facility.latitude);
    const facilityLongitude = Number(facility.longitude);

    const distance = calculateDistance(
      facilityLatitude,
      facilityLongitude,
      userLatitude,
      userLongitude
    );

    // 정렬 배열에 추가
    sortedFacilities.push({ facility, distance });
  });

  // 거리에 따라 정렬
  sortedFacilities.sort((a, b) => a.distance - b.distance);

  // 가장 가까운 numFacilities 개의 시설을 추출하여 새로운 배열에 담기
  const nearestFacilities = sortedFacilities
    .slice(0, numFacilities)
    .map((item) => item.facility);

  return nearestFacilities;
};
