# JS/TS Crash (for Py devs)

- Syntax basics: const=immutable ref, let=mutable, var never. => arrow funcs lexical this. Template strings `hi ${name}`.
Semicolons optional but mostly included.
- Types: string | number, type Foo = { a: string }. Structural typing: any object w/ same fields fits. Interfaces merge; use
type for unions. unknown safer than any. Non-null via value!. Generic fn function id<T>(x:T):T. No runtime types—strip at
compile.
- Modules: ES modules: export const foo, export default. Import w/ import foo from './foo' or { foo }. Node resolves .ts/.js.
Path aliases via tsconfig.
- Async: Promise. await someAsync() inside async fn. Fetch API for HTTP: const res = await fetch(url); const json = await
res.json();. Errors thrown, use try/catch. No requests style session.
- Data: Arrays, objects. Spread: { ...obj, extra: 1 }, [...arr, 2]. Destructure: const { a, b: alias } = obj; const
[first, ...rest] = arr. Map/filter reduce.
- Classes/OO: class Foo { constructor(private id: string) {} method() {} }. Use rarely; functions + objects more idiomatic.
this binding pain—prefer arrow funcs or explicit .bind.
- Collections: Map, Set. Use Record<string, T> for dict. Keys always strings unless Map.
- Null handling: ?? nullish coalescing, ?. optional chaining (foo?.bar). Beware == vs ===; always use ===.
- TS config: tsconfig.json controls strictness. strict: true recommended. Types erased at build; runtime still JS.
- Babel/Vite: bundlers transpile modern syntax. Entry src/main.tsx. Use npm run dev for HMR.
- React quickie: Function components return JSX. Hooks for state: const [x,setX]=useState(). Side effects useEffect(()=>{...},
deps). Zustand store = custom hook. Props typed via type Props = {foo:string} then const Comp: React.FC<Props> = ({foo})
=> ....
- Tooling: npm install pkg, scripts via package.json. Lint w/ eslint, format w/ prettier. Vitest for tests.
- Debug: console.log, DevTools. npm run typecheck ensures TS validity. Use ts-node or node --loader ts-node/esm for scripts.
- Common gotchas: this undefined in functions, undefined vs null, asynchronous operations non-blocking, JSON serialization
loses methods/reference cycles.
- Interop: Use import type { Foo } for types only. Add ambient typings in env.d.ts. JSX requires 'react' in scope or new TS
JSX runtime.
- Build output: TS compiled to JS via tsc. Vite handles bundling, dynamic imports, env vars prefixed VITE_.
- Testing: vitest mimic jest. describe/test/expect. DOM testing w/ Testing Library.

Stick to const, arrow funcs, pure modules, and let TS catch shape errors. Treat runtime as plain JS.

## Data structures

  - Containers: Python list/dict/set map to JS Array<T>, Record<K,V>/plain objects, and Set<T>; when key order or non-string
  keys matter use Map<K,V> (or ReadonlyArray/ReadonlyMap in TS for immutability).
  - Comprehensions: replace with chained array helpers (const squares = data.map(x => x * x)), map/filter/reduce on Set after
  spreading ([...set].map(...)), object creation via Object.fromEntries(array.map(([k,v]) => [k, transform(v)])), or generators
  plus for...of for lazy flows.
  - Monkey patching: JS lets you reassign module exports or prototype methods (SomeClass.prototype.method = ...), but favor
  dependency injection, subclassing/composition, or scoped test doubles (jest.spyOn(obj, 'fn'), vi.mock) to avoid global
  mutation.
  - List concat: use [...a, ...b], a.concat(b), or arr.push(...b) for in-place extension; for huge sequences prefer iterables
  like function* chain(...iters) to avoid copies.
  - Dict concat / |: emulate Python’s union with object spread const merged = { ...a, ...b } (later keys win),
  Object.assign({}, a, b), or new Map([...aEntries, ...bEntries]) when keys aren’t plain strings.
  - Record updates: create new objects via spread const updated = { ...order, status: 'shipped' }, leverage class methods
  (order.withStatus('shipped')), or immutability helpers like Immer; mutable cases simply assign fields but keep object
  identity tracking in mind.

### over a record<k, v>, what are the equivalent of python's .keys(), .values(), and .items()?

> Record<K, V> is just a plain object in JS/TS, so you use the standard object helpers:

  - Keys → Object.keys(record) returns string[] (cast to (keyof typeof record)[] in TS if you need the literal key types).
  - Values → Object.values(record) yields V[]; in TS you may need Object.values(record) as V[] because the helper returns
  any[].
  - Key/value pairs → Object.entries(record) returns [key, value][]. In TS: Object.entries(record) as [keyof typeof record,
  V][].

  Spread ({ ...record }) or for...in loops are alternatives, but Object.* mirrors Python’s dict.keys/values/items most
  directly.

### what's the equivalent of python `for x in y` in js/ts

> Use for…of for iterable sequences: linear arrays, sets, maps, generators. Example: for (const x of y) { … } mirrors Python’s
  for x in y. When you need access to indexes/entries, combine it with helpers like y.entries() or destructuring (for (const
  [k, v] of Object.entries(obj))).

### how about `enumerate`

> enumerate becomes Array.prototype.entries() plus destructuring. For arrays (or anything spreadable), do:

  for (const [index, value] of array.entries()) {
    // use index + value
  }

  If you start from any iterable, wrap it with Array.from(iterable).entries() or build a helper generator:

  function* enumerate<T>(iterable: Iterable<T>, start = 0) {
    let idx = start;
    for (const value of iterable) yield [idx++, value] as const;
  }

  for (const [i, x] of enumerate(y)) { ... }

  That gives you the same index/value pairs as Python’s enumerate.
