import { pathToFileURL } from "node:url"
import { grade } from "./grader.mjs"
const { createApp } = await import(pathToFileURL(process.argv[2]).href)
if (typeof createApp !== "function") throw new Error("app.ts must export createApp")
console.log(JSON.stringify(await grade(createApp, process.argv[3].split(","))))
