import assert from "node:assert/strict";
import test from "node:test";
import { decodeMaterialUpload, MATERIAL_UPLOAD_MAX_BYTES, MATERIAL_EXTENSIONS } from "@molis-ai/molis-work-plugin-sdk";

test("RAC-28 material uploads share one decoder, preserve bytes and accept every supported extension", () => {
  const bytes = Buffer.from("已授权的材料\n");
  for (const extension of Object.values(MATERIAL_EXTENSIONS).flat()) {
    const file_name = `文件${extension.toUpperCase()}`;
    assert.deepEqual(decodeMaterialUpload({ file_name, data_base64: bytes.toString("base64") }), { file_name, bytes });
  }
});

test("RAC-28 material upload refuses paths, unsupported formats, empty or noncanonical base64 and one byte over the limit", () => {
  for (const file_name of ["", ".", "..", "../a.txt", "a/b.txt", "C:\\a.txt", "a\0.txt", `${"a".repeat(241)}.txt`]) {
    assert.throws(() => decodeMaterialUpload({ file_name, data_base64: "eA==" }), { code: "material.invalid_filename" });
  }
  assert.throws(() => decodeMaterialUpload({ file_name: "run.exe", data_base64: "eA==" }), { code: "material.unsupported" });
  for (const data_base64 of ["", "%%%", "eA", "eA==\n", "eB=="]) {
    assert.throws(() => decodeMaterialUpload({ file_name: "a.txt", data_base64 }), { code: "material.invalid_data" });
  }
  const atLimit = Buffer.alloc(MATERIAL_UPLOAD_MAX_BYTES, 120);
  assert.equal(decodeMaterialUpload({ file_name: "large.txt", data_base64: atLimit.toString("base64") }).bytes.length, MATERIAL_UPLOAD_MAX_BYTES);
  assert.throws(() => decodeMaterialUpload({ file_name: "large.txt", data_base64: Buffer.alloc(MATERIAL_UPLOAD_MAX_BYTES + 1).toString("base64") }), { code: "material.invalid_data" });
});
