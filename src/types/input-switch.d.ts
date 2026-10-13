import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match React's own declaration to merge
  interface InputHTMLAttributes<T> {
    /** Safari's native switch for a checkbox (`<input type="checkbox" switch>`); others ignore it. */
    switch?: "";
  }
}
