import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "plugin-tree",
  setup(ctx) {
    process.stderr.write("[plugin-tree] Server plugin loaded\n");
  },
});