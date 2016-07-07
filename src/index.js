// Based on Normalizr 2.0.1
'use strict';
// import { arrayOf, valuesOf, unionOf } from 'normalizr';
import { Record, Map, List, Iterable } from 'immutable';

//Shim for new Proxy instead of Proxy.create
// import Proxy from 'harmony-proxy';
//Should patch proxy to work properly
// import Reflect from 'harmony-reflect';

const Proxy = undefined;

import RecordEntitySchema from './RecordEntitySchema';
import IterableSchema from './IterableSchema';
import UnionSchema from './UnionSchema';
import lodashIsEqual from 'lodash/isEqual';
import lodashIsObject from 'lodash/isObject';

const NormalizedRecord = new Record({entities:null, result: null}, 'NormalizedRecord');
const PolymorphicMapper = new Record({id:null, schema: null});

function defaultAssignEntity(normalized, key, entity) {
  normalized[key] = entity;
}

function proxy(id, schema, bag, options){
  /**
   * if options contains getState reference and reducer key we can create a proxyHandler
   */
  if(typeof Proxy === 'undefined')
    return id;

  return new Proxy({id: id, key: schema.getKey()},{
    get(target, name, receiver) {

      if(name === 'id')
        return target.id;

      const state = options.getState();

      if(state[schema.getReducerKey()].entities){
        if(options.useMapsForEntityObjects){
          return state[schema.getReducerKey()].entities[schema.getKey()].get(target.id + '')[name];
        }else{
          return state[schema.getReducerKey()].entities[schema.getKey()][target.id][name];
        }
      }
      return undefined;
    },
    set(k,v){
      throw new Error('Not supported');
    },
    has(name){
      if(options.useMapsForEntityObjects){
        return options.getState()[schema.getReducerKey()].entities[schema.getKey()].get(id + '').has(name);
      }else{
        return options.getState()[schema.getReducerKey()].entities[schema.getKey()][id].has(name);
      }
    },
    valueOf : function () {
      return 0;
    }
  });
}

function visitObject(obj, schema, bag, options) {
  const _options$assignEntity = options.assignEntity;
  const assignEntity = _options$assignEntity === undefined ? defaultAssignEntity : _options$assignEntity;

  let normalized = {};
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      const entity = visit(obj[key], schema[key], bag, options);
      assignEntity.call(null, normalized, key, entity, obj);
    }
  }
  return new Map(normalized);
}

function visitRecord(obj, schema, bag, options){
  const { assignEntity = defaultAssignEntity } = options;

  let normalized = {};

  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      const entity = visit(obj[key], schema[key], bag, options);

      assignEntity.call(null, normalized, key, entity, obj);
    }
  }

  const Record = schema.getRecord();
  return new Record(normalized);
}

function defaultMapper(iterableSchema, itemSchema, bag, options) {
  return function (obj) {
    return visit(obj, itemSchema, bag, options);
  };
}

function polymorphicMapper(iterableSchema, itemSchema, bag, options) {
  return function (obj) {
    const schemaKey = iterableSchema.getSchemaKey(obj);
    const result = visit(obj, itemSchema[schemaKey], bag, options);
    return new PolymorphicMapper({ id: result, schema: schemaKey });
  };
}

function visitIterable(obj, iterableSchema, bag, options) {
  const itemSchema = iterableSchema.getItemSchema();
  const curriedItemMapper = defaultMapper(iterableSchema, itemSchema, bag, options);

  if (Array.isArray(obj)) {
    return new List(obj.map(curriedItemMapper));
  } else {
    const mp = Object.keys(obj).reduce(function (objMap, key) {
      objMap[key] = curriedItemMapper(obj[key]);
      return objMap;
    }, {});
    return new Map(mp);
  }
}

function visitUnion(obj, unionSchema, bag, options) {
  const itemSchema = unionSchema.getItemSchema();
  return polymorphicMapper(unionSchema, itemSchema, bag, options)(obj);
}

function defaultMergeIntoEntity(entityA, entityB, entityKey) {
  if(entityA === null)
    return entityB;

    if(!entityA.equals(entityB)){

      console.info(
        `When checking two ${entityKey}, found unequal data. Merging the data. You should consider making sure these objects are equal.`,
        entityA, entityB
      );

      return entityA.merge(entityB);
    }

  return entityA;
}

function visitEntity(entity, entitySchema, bag, options) {
  // if(!(entitySchema instanceof RecordEntitySchema))
  //   throw new Error('Immutable Normalizr expects a Record object as part of the Schema')

  const _options$mergeIntoEntity = options.mergeIntoEntity;
  const mergeIntoEntity = _options$mergeIntoEntity === undefined ? defaultMergeIntoEntity : _options$mergeIntoEntity;

  const entityKey = entitySchema.getKey();
  const id = entitySchema.getId(entity);

  if (!bag.hasOwnProperty(entityKey)) {
    bag[entityKey] = {};
  }

  if (!bag[entityKey].hasOwnProperty(id)) {
    bag[entityKey][id] = null;
  }

  let stored = bag[entityKey][id];
  let normalized = visitRecord(entity, entitySchema, bag, options);
  bag[entityKey][id] = mergeIntoEntity(stored, normalized, entityKey);

  if(options.getState){
    return proxy(id, entitySchema, bag, options);
  }

  return id;
}

function visit(obj, schema, bag, options = {}) {
  if (!lodashIsObject(schema)) {
    return obj;
  }

  if (!lodashIsObject(obj) && schema._mappedBy) {
    obj = {
      [schema.getIdAttribute()]: obj,
    };
  } else if (!lodashIsObject(obj)) {
    return obj;
  }

  if (schema instanceof RecordEntitySchema) {
    return visitEntity(obj, schema, bag, options);
  } else if (schema instanceof IterableSchema) {
    return visitIterable(obj, schema, bag, options);
  } else if (schema instanceof UnionSchema) {
    return visitUnion(obj, schema, bag, options);
  } else {
    //we want the root object to be processed as a record, all others, not managed by a record should become a Map
    return visitObject(obj, schema, bag, options);
  }
}

function arrayOf(schema, options) {
  return new IterableSchema(schema, options);
}

function valuesOf(schema, options) {
  return new IterableSchema(schema, options);
}

function unionOf(schema, options) {
  return new UnionSchema(schema, options);
}

/**
 * object: a javascript object
 * schema: a RecordEntitySchema
 * options: an object with the following optional keys
 *  getState: a function reference that returns the current state. If available, a proxy will be placed in place of an id reference (the key needs to be reference in the schema definition)
 *  useMapsForEntityObjects: boolean. If true, will use a Map in stead of a Record to store id-RecordObject pairs. This means that you have to access a specific entity object like so:
 *  `
 * useMapsForEntityObjects:false, this.props.articleReducer.entities.articles[5].label
 *    {
 *      entities:{//Record key
 *        articles:{//Record key
 *          5:{//Record
 *              label: 'article label'
 *          }
 *        }
 *      }
 *    }
 * useMapsForEntityObjects:true, this.props.articleReducer.entities.articles.get(5).label
 *  `
 *    {
 *      entities:{//Record key
 *        articles:{//Record key
 *          5:{//Map key
 *              label: 'article label'
 *          }
 *        }
 *      }
 *    }
 *  `
 * If you use proxies, the impact on your code will be minimal.
 * The disadvantage of using Records in stead of Maps for the entity objects is that when you try to merge new content into the Record, you will fail.
 */
function normalize(obj, schema, options = {
  getState: undefined,
  useMapsForEntityObjects: false,
  useProxyForResults:false
}) {

  if (!lodashIsObject(obj) && !Array.isArray(obj)) {
    throw new Error('Normalize accepts an object or an array as its input.');
  }

  if (!lodashIsObject(schema) || Array.isArray(schema)) {
    throw new Error('Normalize accepts an object for schema.');
  }

  if(options.getState && typeof Proxy === 'undefined'){
    console.warn('Proxies not supported in this environment');
  }

  let bag = {};
  let entityStructure = {};
  let results = [];

  //This will either return a sequence, an id or a Proxy object
  let result = visit(obj, schema, bag, options);

  //we are now assuming that the returned "ids" are actually proxies if there is a getState method
  if(options.getState && !options.useProxyForResults){
    results = result instanceof List?
      result.map(function(val){
        return val.id;
      }) :
      result.id
  }else{
    results = result;
  }

  let entities = null;

  for(let schemaKey in bag){
    entityStructure[schemaKey] = new Map(bag[schemaKey]);
  }

  return new Map({
    entities: new Map(entityStructure),
    result: results
  });
}

export {
  NormalizedRecord,
  arrayOf,
  valuesOf,
  unionOf,
  normalize,
  RecordEntitySchema as Schema
};
