import { default as $p } from "npm:jsonpointer";

const setNew = (data: object, path: string) => {
    const tmpObj = {};
    $p.set(tmpObj, path, data);
    return tmpObj;
  };
Object.defineProperty($p, 'new', { value: setNew, writable: false, configurable: false, enumerable: false });

export default $p;
export { $p };
