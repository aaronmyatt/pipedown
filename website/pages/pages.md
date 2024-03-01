# Pages

```ts
import { DOMParser } from "https://esm.sh/linkedom";
input.DOMParser = new DOMParser();
```

## defaultLayout
```ts
import layout from 'layout';
Object.assign(input, await layout.process(input));
```

## HomePage
- route: /home
- ```ts
  import home from 'home';
  Object.assign(input, await home.process(input));
  ```

## endWithHtml
```ts
Object.assign(input.responseOptions.headers, { "content-type": "text/html" });
input.responseOptions.status = 200;
input.body = input.layout.toString();
```
