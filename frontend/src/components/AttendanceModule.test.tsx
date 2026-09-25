// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {AttendanceModule} from './AttendanceModule';
import {Button} from './Button';
import type {EventSummary} from '@/api/types';
const event:EventSummary={id:'event',title:'Gathering',description:'Meet your community',location:'Brooklyn',eventType:'ADOPTION_EVENT',status:'PUBLISHED',startsAt:'2099-09-27T12:00Z',endsAt:'2099-09-27T15:00Z',timezone:'America/New_York',capacity:3,confirmedCount:2,spotsRemaining:1,isFull:false,waitlistEnabled:true,createdById:'owner',createdAt:'2026-01-01T00:00Z',updatedAt:'2026-01-01T00:00Z',viewerRsvp:null};
afterEach(cleanup);
function show(overrides:Partial<EventSummary>={},signedIn=true,isSubmitting=false) {const onJoin=vi.fn(),onLeave=vi.fn();render(<MemoryRouter><AttendanceModule event={{...event,...overrides}} isSignedIn={signedIn} isSubmitting={isSubmitting} onJoin={onJoin} onLeave={onLeave}/></MemoryRouter>);return {onJoin,onLeave};}
describe('attendance states',()=>{
 it('invokes join only on user action',async()=>{const {onJoin}=show();expect(onJoin).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('button',{name:'RSVP'}));expect(onJoin).toHaveBeenCalledTimes(1);});
 it('offers waitlisting when full',()=>{show({isFull:true,confirmedCount:3,spotsRemaining:0});expect(screen.getByRole('button',{name:'Join waitlist'})).toBeTruthy();});
 it('does not send anonymous users through auth for a closed full event',()=>{show({isFull:true,waitlistEnabled:false},false);expect((screen.getByRole('button',{name:'Event full'}) as HTMLButtonElement).disabled).toBe(true);});
 it('keeps confirmed state and cancellation clear',()=>{show({viewerRsvp:{status:'CONFIRMED',waitlistPosition:null}});expect(screen.getByText('You’re confirmed')).toBeTruthy();expect(screen.getByRole('button',{name:'Cancel RSVP'})).toBeTruthy();});
 it('shows queue position',()=>{show({viewerRsvp:{status:'WAITLISTED',waitlistPosition:4}});expect(screen.getByText(/Position #4/)).toBeTruthy();expect(screen.getByRole('button',{name:'Leave waitlist'})).toBeTruthy();});
 it.each(['DRAFT','CANCELLED','COMPLETED'] as const)('prevents joins for %s',status=>{show({status});expect(screen.queryByRole('button')).toBeNull();});
 it('closes ended published events',()=>{show({endsAt:'2020-01-01T00:00Z'});expect(screen.getByText('Event finished')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();});
 it('disables pending requests',()=>{show({},true,true);expect((screen.getByRole('button',{name:'Joining…'}) as HTMLButtonElement).disabled).toBe(true);});
 it('loading cannot be overridden by disabled=false',()=>{render(<Button isLoading disabled={false}>Save</Button>);expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);});
});
