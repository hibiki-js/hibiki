# Middleware

```ts
app.useMiddleware(async (context, next) => {
  const start = performance.now()
  await next()
  console.log(context.provider, performance.now() - start)
})
```

Hibiki does not log by itself. Put logging, metrics, and tracing in middleware.
