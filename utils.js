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
