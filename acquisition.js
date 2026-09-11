// One 1 MeV photon per decay; constant activity during the measurement.
export const BQ_PER_UCI=37000;
export function exposure(activityUCi,measurementSeconds){
  if(!Number.isFinite(activityUCi)||activityUCi<0||!Number.isFinite(measurementSeconds)||measurementSeconds<0)throw new RangeError('Activity and measurement time must be finite and nonnegative.');
  return {activityBq:activityUCi*BQ_PER_UCI,emitted:activityUCi*BQ_PER_UCI*measurementSeconds};
}
