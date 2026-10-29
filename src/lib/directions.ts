/** Where to get directions to a staging point: the phone's maps app, from the words the organizer wrote (nothing is geocoded here). */
export const directionsHref = (staging: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(staging)}`;
