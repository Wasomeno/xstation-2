let THREE = null;
let mergeVertices = null;
const pendingMessages = [];

const boot = Promise.all([
  import("https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js"),
]).then(([three]) => {
  THREE = three;
  mergeVertices = mergeVerticesImplementation;
  while (pendingMessages.length) processMessage(pendingMessages.shift());
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  self.postMessage({ type: "boot-error", error: message });
  while (pendingMessages.length) {
    const { id } = pendingMessages.shift().data;
    self.postMessage({ id, error: message });
  }
});

// Keep this implementation byte-equivalent to Three.js 0.181.2's
// BufferGeometryUtils.mergeVertices. The utility module imports the bare
// specifier "three", which is resolved by the page import map but not by a
// module worker, so the small dependency is kept inline here.
function mergeVerticesImplementation(geometry, tolerance = 1e-4) {
  tolerance = Math.max(tolerance, Number.EPSILON);
  const hashToIndex = {};
  const indices = geometry.getIndex();
  const positions = geometry.getAttribute("position");
  const vertexCount = indices ? indices.count : positions.count;
  let nextIndex = 0;
  const attributeNames = Object.keys(geometry.attributes);
  const tmpAttributes = {};
  const tmpMorphAttributes = {};
  const newIndices = [];
  const getters = ["getX", "getY", "getZ", "getW"];
  const setters = ["setX", "setY", "setZ", "setW"];

  for (let i = 0, l = attributeNames.length; i < l; i += 1) {
    const name = attributeNames[i];
    const attr = geometry.attributes[name];
    tmpAttributes[name] = new attr.constructor(
      new attr.array.constructor(attr.count * attr.itemSize),
      attr.itemSize,
      attr.normalized,
    );
    const morphAttributes = geometry.morphAttributes[name];
    if (morphAttributes) {
      tmpMorphAttributes[name] = [];
      morphAttributes.forEach((morphAttr, index) => {
        const array = new morphAttr.array.constructor(morphAttr.count * morphAttr.itemSize);
        tmpMorphAttributes[name][index] = new morphAttr.constructor(
          array,
          morphAttr.itemSize,
          morphAttr.normalized,
        );
      });
    }
  }

  const halfTolerance = tolerance * 0.5;
  const exponent = Math.log10(1 / tolerance);
  const hashMultiplier = Math.pow(10, exponent);
  const hashAdditive = halfTolerance * hashMultiplier;
  for (let i = 0; i < vertexCount; i += 1) {
    const index = indices ? indices.getX(i) : i;
    let hash = "";
    for (let j = 0, l = attributeNames.length; j < l; j += 1) {
      const attribute = geometry.getAttribute(attributeNames[j]);
      for (let k = 0; k < attribute.itemSize; k += 1) {
        hash += `${~~(attribute[getters[k]](index) * hashMultiplier + hashAdditive)},`;
      }
    }
    if (hash in hashToIndex) {
      newIndices.push(hashToIndex[hash]);
      continue;
    }
    for (let j = 0, l = attributeNames.length; j < l; j += 1) {
      const name = attributeNames[j];
      const attribute = geometry.getAttribute(name);
      const morphAttributes = geometry.morphAttributes[name];
      const itemSize = attribute.itemSize;
      const newArray = tmpAttributes[name];
      const newMorphArrays = tmpMorphAttributes[name];
      for (let k = 0; k < itemSize; k += 1) {
        const getterFunc = getters[k];
        const setterFunc = setters[k];
        newArray[setterFunc](nextIndex, attribute[getterFunc](index));
        if (morphAttributes) {
          for (let m = 0, ml = morphAttributes.length; m < ml; m += 1) {
            newMorphArrays[m][setterFunc](nextIndex, morphAttributes[m][getterFunc](index));
          }
        }
      }
    }
    hashToIndex[hash] = nextIndex;
    newIndices.push(nextIndex);
    nextIndex += 1;
  }

  const result = geometry.clone();
  for (const name in geometry.attributes) {
    const tmpAttribute = tmpAttributes[name];
    result.setAttribute(
      name,
      new tmpAttribute.constructor(
        tmpAttribute.array.slice(0, nextIndex * tmpAttribute.itemSize),
        tmpAttribute.itemSize,
        tmpAttribute.normalized,
      ),
    );
    if (!(name in tmpMorphAttributes)) continue;
    for (let j = 0; j < tmpMorphAttributes[name].length; j += 1) {
      const tmpMorphAttribute = tmpMorphAttributes[name][j];
      result.morphAttributes[name][j] = new tmpMorphAttribute.constructor(
        tmpMorphAttribute.array.slice(0, nextIndex * tmpMorphAttribute.itemSize),
        tmpMorphAttribute.itemSize,
        tmpMorphAttribute.normalized,
      );
    }
  }
  result.setIndex(newIndices);
  return result;
}

const ARRAY_TYPES = {
  Float32Array,
  Float64Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
};

function attributeFromPayload(payload) {
  const ArrayType = ARRAY_TYPES[payload.arrayType];
  if (!ArrayType) throw new Error(`Unsupported geometry array type: ${payload.arrayType}`);
  return new THREE.BufferAttribute(
    new ArrayType(payload.buffer),
    payload.itemSize,
    payload.normalized,
  );
}

function geometryFromPayload(payload) {
  const geometry = new THREE.BufferGeometry();
  Object.entries(payload.attributes).forEach(([name, attribute]) => {
    geometry.setAttribute(name, attributeFromPayload(attribute));
  });

  if (payload.index) geometry.setIndex(attributeFromPayload(payload.index));
  payload.groups.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex));
  geometry.setDrawRange(payload.drawRange.start, payload.drawRange.count);

  Object.entries(payload.morphAttributes).forEach(([name, attributes]) => {
    geometry.morphAttributes[name] = attributes.map(attributeFromPayload);
  });
  geometry.morphTargetsRelative = Boolean(payload.morphTargetsRelative);
  return geometry;
}

function attributeToPayload(attribute, transferables) {
  const array = attribute.array;
  const buffer = array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
  transferables.push(buffer);
  return {
    buffer,
    arrayType: array.constructor.name,
    itemSize: attribute.itemSize,
    normalized: attribute.normalized,
  };
}

function geometryToPayload(geometry) {
  const transferables = [];
  const attributes = {};
  Object.entries(geometry.attributes).forEach(([name, attribute]) => {
    attributes[name] = attributeToPayload(attribute, transferables);
  });

  const morphAttributes = {};
  Object.entries(geometry.morphAttributes).forEach(([name, list]) => {
    morphAttributes[name] = list.map((attribute) => attributeToPayload(attribute, transferables));
  });

  const index = geometry.getIndex();
  const indexPayload = index ? attributeToPayload(index, transferables) : null;
  return {
    payload: {
      attributes,
      morphAttributes,
      morphTargetsRelative: geometry.morphTargetsRelative,
      index: indexPayload,
      groups: geometry.groups.map((group) => ({ ...group })),
      drawRange: { ...geometry.drawRange },
    },
    transferables,
  };
}

function processMessage(event) {
  const { id, geometry, tolerance } = event.data;
  try {
    const source = geometryFromPayload(geometry);
    const prepared = mergeVertices(source, tolerance);
    prepared.computeVertexNormals();
    const result = geometryToPayload(prepared);
    self.postMessage({ id, geometry: result.payload }, result.transferables);
    source.dispose();
    prepared.dispose();
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

self.addEventListener("message", (event) => {
  if (mergeVertices) processMessage(event);
  else pendingMessages.push(event);
});
