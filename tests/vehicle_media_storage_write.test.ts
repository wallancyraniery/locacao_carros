// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({create:vi.fn(),from:vi.fn(),sign:vi.fn(),remove:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@supabase/supabase-js',()=>({createClient:mock.create}));
import { signVehicleMediaUpload,removeVehicleMediaObject } from '@/modules/vehicle_media/storage_write.server';
const path='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.png';
const key='sb_secret_'+'synthetic_only_for_tests';
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://synthetic.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','sb_publishable_synthetic');vi.stubEnv('SUPABASE_VEHICLE_MEDIA_SECRET_KEY',key);
  mock.create.mockReturnValue({storage:{from:mock.from}});mock.from.mockReturnValue({createSignedUploadUrl:mock.sign,remove:mock.remove});
  mock.sign.mockResolvedValue({data:{path,signedUrl:`https://synthetic.supabase.co/storage/v1/object/upload/sign/vehicle-media/${path}?token=synthetic`},error:null});
  mock.remove.mockResolvedValue({data:[{name:path}],error:null});
});
afterEach(()=>vi.unstubAllEnvs());
it('emissor isolado usa secret somente no servidor e fixa bucket/path/upsert false',async()=>{
  const result=await signVehicleMediaUpload(path);
  expect(result).not.toContain(key);
  expect(mock.create).toHaveBeenCalledWith('https://synthetic.supabase.co',key,expect.objectContaining({auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}));
  expect(mock.from).toHaveBeenCalledWith('vehicle-media');expect(mock.sign).toHaveBeenCalledWith(path,{upsert:false});
});
it.each(['','sb_publishable_synthetic','legacy-jwt'])('não usa fallback quando secret inválido (%s)',async(value)=>{
  vi.stubEnv('SUPABASE_VEHICLE_MEDIA_SECRET_KEY',value);
  await expect(signVehicleMediaUpload(path)).rejects.toThrow();expect(mock.create).not.toHaveBeenCalled();
});
it.each([[[]],[[{name:path}]]])('remoção aceita confirmação autoritativa de presença/ausência',async(data)=>{
  mock.remove.mockResolvedValue({data,error:null});await expect(removeVehicleMediaObject(path)).resolves.toBeUndefined();expect(mock.remove).toHaveBeenCalledWith([path]);
});
it.each([null,[{name:'other-path'}]])('resposta de remoção inconsistente não confirma',async(data)=>{
  mock.remove.mockResolvedValue({data,error:null});await expect(removeVehicleMediaObject(path)).rejects.toThrow();
});
it('falha transitória não vira confirmação de ausência',async()=>{
  mock.remove.mockResolvedValue({data:[],error:{message:'private'}});await expect(removeVehicleMediaObject(path)).rejects.toThrow('Remoção indisponível.');
});
it('path arbitrário é recusado antes do client privilegiado',async()=>{
  await expect(signVehicleMediaUpload('../other')).rejects.toThrow();await expect(removeVehicleMediaObject('other')).rejects.toThrow();expect(mock.create).not.toHaveBeenCalled();
});
