// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({context:vi.fn(),rpc:vi.fn(),storage:vi.fn(),download:vi.fn(),remove:vi.fn(),upload:vi.fn(),inspect:vi.fn(),finish:vi.fn(),refresh:vi.fn(),user:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/modules/central/access.server',()=>({loadCentralContext:mock.context}));
vi.mock('@/modules/vehicle_media/inspect_file.server',()=>({inspectVehicleImageFile:mock.inspect}));
vi.mock('@/modules/vehicle_media/runtime.server',()=>({finishMedia:mock.finish}));
vi.mock('@/modules/vehicle_media/storage_write.server',()=>({
  signVehicleMediaUpload:async(path:string)=>{const result=await mock.upload(path,{upsert:false});if(result.error||!result.data)throw new Error('unavailable');const {validateMediaStorageUrl}=await import('@/modules/vehicle_media/storage_url.server');return validateMediaStorageUrl(result.data.signedUrl,path,'upload');},
  removeVehicleMediaObject:async(path:string)=>{const result=await mock.remove([path]);if(result.error||!Array.isArray(result.data))throw new Error('unavailable');},
}));
vi.mock('next/cache',()=>({revalidatePath:mock.refresh}));
import {prepareVehicleMedia,finalizeVehicleMedia,deleteVehicleMedia,reorderVehicleMedia} from '@/modules/vehicle_media/actions';
const org='10000000-0000-4000-8000-000000000001',vehicle='20000000-0000-4000-8000-000000000001',id='60000000-0000-4000-8000-000000000001',operation='70000000-0000-4000-8000-000000000001';
const path=`${org}/${vehicle}/${id}.png`;
const record={id,vehicle_id:vehicle,storage_path:path,status:'prepared',position:null,mime_type:'image/png',byte_size:100,expires_at:'2099-01-01T00:00:00Z'};
const context={status:'ready',role:'owner',organization:{id:org},client:{rpc:mock.rpc,auth:{getUser:mock.user},storage:{from:mock.storage}}};
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://synthetic.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','sb_publishable_synthetic');
  mock.context.mockResolvedValue(context);mock.user.mockResolvedValue({data:{user:{id:operation}},error:null});
  mock.storage.mockReturnValue({createSignedUploadUrl:mock.upload,download:mock.download,remove:mock.remove});
  mock.rpc.mockImplementation(async(name:string)=>({data:name==='list_vehicle_media'?[record]:name==='delete_vehicle_media'?{...record,status:'deleting',expires_at:null}:record,error:null}));
  mock.upload.mockResolvedValue({data:{signedUrl:`https://synthetic.supabase.co/storage/v1/object/upload/sign/vehicle-media/${path}?token=synthetic`},error:null});
  mock.download.mockResolvedValue({data:new Blob(['synthetic']),error:null});mock.inspect.mockResolvedValue({width:800,height:600});mock.remove.mockResolvedValue({data:[],error:null});
});
it('prepare usa path da RPC e não aceita organização/path do formulário',async()=>{
  expect(await prepareVehicleMedia(vehicle,operation,{mimeType:'image/png',byteSize:100,organizationId:org,path:'arbitrary'})).toMatchObject({status:'error'});
  expect(mock.rpc).not.toHaveBeenCalled();
  expect(await prepareVehicleMedia(vehicle,operation,{mimeType:'image/png',byteSize:100})).toMatchObject({status:'prepared',imageId:id});
  expect(mock.upload).toHaveBeenCalledWith(path,{upsert:false});
});
it.each(['anonymous','unassigned','member'])('bloqueia %s antes de RPC/Storage/runtime',async(status)=>{
  mock.context.mockResolvedValue(status==='member'?{...context,role:'member'}:{status});
  expect((await prepareVehicleMedia(vehicle,operation,{mimeType:'image/png',byteSize:100})).status).toBe('error');
  expect((await finalizeVehicleMedia(vehicle,id)).status).toBe('error');
  expect((await deleteVehicleMedia(vehicle,id)).status).toBe('error');
  expect((await reorderVehicleMedia(vehicle,[id])).status).toBe('error');
  expect(mock.rpc).not.toHaveBeenCalled();expect(mock.storage).not.toHaveBeenCalled();expect(mock.finish).not.toHaveBeenCalled();
});
it('finalize decodifica antes de confirmar com identidade server-side',async()=>{
  expect(await finalizeVehicleMedia(vehicle,id)).toEqual({status:'success'});
  expect(mock.download).toHaveBeenCalledWith(path);expect(mock.inspect).toHaveBeenCalledWith(expect.any(Blob),'image/png',100);
  expect(mock.finish).toHaveBeenCalledWith(operation,vehicle,id,false,800,600);
  expect(mock.inspect.mock.invocationCallOrder[0]).toBeLessThan(mock.finish.mock.invocationCallOrder[0]);
});
it('conteúdo inválido nunca vira ready e erro privado não vaza',async()=>{
  mock.inspect.mockRejectedValue(new Error('token private object owner@example.test'));
  const result=await finalizeVehicleMedia(vehicle,id);expect(result.status).toBe('error');expect(JSON.stringify(result)).not.toMatch(/private|owner@|token/);expect(mock.finish).not.toHaveBeenCalled();
});
it('não confirma imagem de outro veículo nem imagem ausente',async()=>{
  mock.rpc.mockResolvedValue({data:[{...record,vehicle_id:org}],error:null});
  expect((await finalizeVehicleMedia(vehicle,id)).status).toBe('error');expect(mock.download).not.toHaveBeenCalled();
  mock.rpc.mockResolvedValue({data:[],error:null});expect((await finalizeVehicleMedia(vehicle,id)).status).toBe('error');
});
it('delete invalida vitrine antes do Storage; falha conserva retry sem finish',async()=>{
  mock.remove.mockResolvedValue({error:{message:'private'}});
  expect((await deleteVehicleMedia(vehicle,id)).status).toBe('error');
  expect(mock.refresh.mock.invocationCallOrder[0]).toBeLessThan(mock.remove.mock.invocationCallOrder[0]);expect(mock.finish).not.toHaveBeenCalled();
  mock.remove.mockResolvedValue({data:[],error:null});expect(await deleteVehicleMedia(vehicle,id)).toEqual({status:'success'});
  expect(mock.finish).toHaveBeenCalledWith(operation,vehicle,id,true);
});
it('reorder recusa duplicatas sem chegar ao banco',async()=>{
  expect((await reorderVehicleMedia(vehicle,[id,id])).status).toBe('error');expect(mock.rpc).not.toHaveBeenCalled();
  expect(await reorderVehicleMedia(vehicle,[id])).toEqual({status:'success'});
});
it('URL de upload de origem alheia é recusada',async()=>{
  mock.upload.mockResolvedValue({data:{signedUrl:'https://attacker.example/upload?token=private'},error:null});
  expect((await prepareVehicleMedia(vehicle,operation,{mimeType:'image/png',byteSize:100})).status).toBe('error');
});

it.each([{ removedObjects: [{ name: path }] }, { removedObjects: [] }])('expired cleanup confirms removal before allocating a new slot ($removedObjects)', async ({ removedObjects }) => {
  mock.rpc.mockImplementation(async (name: string) => ({
    data: name === 'list_vehicle_media' ? [{ ...record, status: 'deleting', expires_at: null }] : record,
    error: null,
  }));
  mock.remove.mockResolvedValue({ data: removedObjects, error: null });
  expect((await prepareVehicleMedia(vehicle, operation, { mimeType: 'image/png', byteSize: 100 })).status).toBe('prepared');
  expect(mock.remove).toHaveBeenCalledWith([path]);
  expect(mock.finish).toHaveBeenCalledWith(operation, vehicle, id, true);
  expect(mock.remove.mock.invocationCallOrder[0]).toBeLessThan(mock.finish.mock.invocationCallOrder[0]);
  expect(mock.finish.mock.invocationCallOrder[0]).toBeLessThan(mock.rpc.mock.invocationCallOrder[1]);
});
it('expired cleanup remains retryable on transient Storage failure and does not allocate or sign', async () => {
  mock.rpc.mockImplementation(async (name: string) => ({
    data: name === 'list_vehicle_media' ? [{ ...record, status: 'deleting', expires_at: null }] : record,
    error: null,
  }));
  mock.remove.mockResolvedValueOnce({ data: null, error: { message: 'temporary private failure' } });
  expect((await prepareVehicleMedia(vehicle, operation, { mimeType: 'image/png', byteSize: 100 })).status).toBe('error');
  expect(mock.finish).not.toHaveBeenCalled();
  expect(mock.upload).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalledWith('prepare_vehicle_media', expect.anything());
  expect((await prepareVehicleMedia(vehicle, operation, { mimeType: 'image/png', byteSize: 100 })).status).toBe('prepared');
  expect(mock.remove).toHaveBeenCalledTimes(2);
  expect(mock.finish).toHaveBeenCalledTimes(1);
});
it('a deleted retry never calls Storage again', async () => {
  mock.rpc.mockResolvedValue({ data: { ...record, status: 'deleted', expires_at: null }, error: null });
  expect(await deleteVehicleMedia(vehicle, id)).toEqual({ status: 'success' });
  expect(mock.remove).not.toHaveBeenCalled();
  expect(mock.finish).not.toHaveBeenCalled();
});

it('malformed successful Storage removal never confirms deleted', async () => {
  mock.remove.mockResolvedValue({ data: null, error: null });
  expect((await deleteVehicleMedia(vehicle, id)).status).toBe('error');
  expect(mock.finish).not.toHaveBeenCalled();
});
