declare const LIVE: unique symbol;

/** A socket or replay value. Not an official result. */
export type LiveOnly<T> = T & { readonly [LIVE]: true };

/** An official value. A live brand is not assignable to this. */
export type Authoritative<T> = T & { readonly [LIVE]?: never };
