const ASSERT_PACKAGES = ['fibers', 'ddp-common', 'webapp'];

export type MeteorRequire = (packageName: string) => any;

let GPackage = {};
let meteorRequire: MeteorRequire;

export function getPackage(packageName: string, required: boolean = false) {
  if ( GPackage[packageName] ) {
    return GPackage[packageName];
  }

  let mod = global['Package'][packageName];
  if ( required && undefined === mod ) {
    mod = meteorRequire(packageName);
  }

  if ( mod ) {
    GPackage[packageName] = mod;
  }

  return mod;
}

export function setRequire(mRequire: MeteorRequire) {
  meteorRequire = mRequire;

  // Makes sure all required packages exists.
  ASSERT_PACKAGES.forEach((packageName) => getPackage(packageName, true));
}
