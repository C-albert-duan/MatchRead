/** Resolve extensionless relative imports to `.ts` for Node's type stripper. */
export async function resolve(specifier, context, nextResolve) {
  const relative =
    specifier.startsWith("./") || specifier.startsWith("../");
  const hasExt = /\.[cm]?[jt]s$/.test(specifier);
  if (relative && !hasExt) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
