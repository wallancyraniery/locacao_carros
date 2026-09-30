// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { imageUploadInputSchema, mediaMetadataSchema } from "@/modules/vehicle_media/validation";
vi.mock("server-only", () => ({}));
import { inspectVehicleImageFile } from "@/modules/vehicle_media/inspect_file.server";
const migration=readFileSync('drizzle/0014_tenant_vehicle_media.sql','utf8');
it("Storage usa somente policies: nenhum trigger, DELETE SQL ou JWT técnico",()=>{
  expect(migration).not.toMatch(/CREATE\s+(?:CONSTRAINT\s+)?TRIGGER/i);
  expect(migration).not.toMatch(/(?:DELETE FROM|INSERT INTO|UPDATE)\s+storage\.(objects|buckets)/i);
  expect(readFileSync('src/modules/vehicle_media/actions.ts','utf8')).not.toMatch(/service_role|VEHICLE_MEDIA_SERVER_JWT/);
});
it.each(['jpeg','png','webp'] as const)("decodifica pixels reais %s e confere tamanho e MIME",async(format)=>{
  const bytes=await sharp({create:{width:20,height:10,channels:3,background:'#aabbcc'}}).toFormat(format).toBuffer();
  const mime=`image/${format}` as 'image/jpeg'|'image/png'|'image/webp';
  const blob=new Blob([new Uint8Array(bytes)]);
  expect(await inspectVehicleImageFile(blob,mime,bytes.length)).toEqual({mimeType:mime,byteSize:bytes.length,width:20,height:10});
  await expect(inspectVehicleImageFile(blob,mime,bytes.length+1)).rejects.toThrow();
  await expect(inspectVehicleImageFile(new Blob([new Uint8Array(bytes.subarray(0,15))]),mime,15)).rejects.toThrow();
});
it("SVG, tamanho inválido e conteúdo disfarçado são recusados",async()=>{
  for(const input of [{mimeType:'image/svg+xml',byteSize:100},{mimeType:'image/png',byteSize:5242881},{mimeType:'image/png',byteSize:0}]) expect(imageUploadInputSchema.safeParse(input).success).toBe(false);
  const data=new Blob(['<svg></svg>']);
  await expect(inspectVehicleImageFile(data,'image/png',data.size)).rejects.toThrow();
});
it("metadata prepared aceita posição nula",()=>{
  expect(mediaMetadataSchema.safeParse({id:'60000000-0000-4000-8000-000000000001',vehicle_id:'20000000-0000-4000-8000-000000000001',storage_path:'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.png',status:'prepared',position:null,mime_type:'image/png',byte_size:100,expires_at:'2026-09-28T12:00:00Z'}).success).toBe(true);
});

it("histórico não depende de HTTP bruto e client privilegiado fica server-only",()=>{
  expect(migration).not.toMatch(/request\.(method|headers|path)/);
  const writer=readFileSync('src/modules/vehicle_media/storage_write.server.ts','utf8');
  expect(writer).toContain('import "server-only"');
  expect(writer).toContain('upsert: false');
  expect(readFileSync('src/modules/vehicle_media/manager.tsx','utf8')).not.toMatch(/SECRET_KEY|storage_write|service_role/);
});
