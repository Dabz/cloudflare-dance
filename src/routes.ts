import {
  type RouteConfig,
  route,
} from "@react-router/dev/routes";

export default [
  route("/", "./App.tsx"),
  route("/room/:id", "./Room.tsx"),
] satisfies RouteConfig;
