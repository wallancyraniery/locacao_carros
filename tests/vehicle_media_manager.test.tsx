import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VehicleMediaManager } from '@/modules/vehicle_media/manager';
const mock=vi.hoisted(()=>({prepare:vi.fn(),finalize:vi.fn(),remove:vi.fn(),reorder:vi.fn(),refresh:vi.fn(),fetch:vi.fn()}));
vi.mock('@/modules/vehicle_media/actions',()=>({prepareVehicleMedia:mock.prepare,finalizeVehicleMedia:mock.finalize,deleteVehicleMedia:mock.remove,reorderVehicleMedia:mock.reorder}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mock.refresh})}));
const vehicle='20000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',mock.fetch);mock.prepare.mockResolvedValue({status:'prepared',imageId:'photo',uploadUrl:'https://synthetic.supabase.co/storage/v1/object/upload/sign/vehicle-media/synthetic?token=synthetic',publishableKey:'sb_publishable_synthetic'});mock.fetch.mockResolvedValue({ok:true});mock.finalize.mockResolvedValue({status:'success'});mock.reorder.mockResolvedValue({status:'success'});mock.remove.mockResolvedValue({status:'success'});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('envia binário diretamente ao Storage e finaliza somente depois',async()=>{
  render(<VehicleMediaManager vehicleId={vehicle} images={[]} />);
  const file=new File(['synthetic'],'car.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('Adicionar foto'),{target:{files:[file]}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar foto'}));
  await waitFor(()=>expect(mock.finalize).toHaveBeenCalledWith(vehicle,'photo'));
  expect(mock.prepare).toHaveBeenCalledWith(vehicle,expect.any(String),{mimeType:'image/png',byteSize:file.size});
  expect(mock.fetch).toHaveBeenCalledWith(expect.stringContaining('synthetic.supabase.co/storage/'),expect.objectContaining({method:'PUT',body:expect.any(FormData),headers:expect.objectContaining({'x-upsert':'false'})}));
  expect(mock.fetch.mock.invocationCallOrder[0]).toBeLessThan(mock.finalize.mock.invocationCallOrder[0]);
  await screen.findByText('Fotos atualizadas.');
});
it('capa reordena conjunto completo e retry de remoção conserva identidade',async()=>{
  render(<VehicleMediaManager vehicleId={vehicle} images={[{id:'first',status:'ready',position:0,url:null},{id:'second',status:'ready',position:1,url:null},{id:'third',status:'deleting',position:null,url:null}]} />);
  fireEvent.click(screen.getByRole('button',{name:'Definir como capa'}));
  await waitFor(()=>expect(mock.reorder).toHaveBeenCalledWith(vehicle,['second','first']));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Tentar remoção novamente'})).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button',{name:'Tentar remoção novamente'}));
  await waitFor(()=>expect(mock.remove).toHaveBeenCalledWith(vehicle,'third'));
});
it('recusa SVG antes de preparar upload',async()=>{
  render(<VehicleMediaManager vehicleId={vehicle} images={[]} />);
  fireEvent.change(screen.getByLabelText('Adicionar foto'),{target:{files:[new File(['<svg/>'],'x.svg',{type:'image/svg+xml'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar foto'}));
  await screen.findByText('Escolha uma foto JPEG, PNG ou WebP de até 5 MB.');expect(mock.prepare).not.toHaveBeenCalled();expect(mock.fetch).not.toHaveBeenCalled();
});
