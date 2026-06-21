import { create } from 'zustand'

export type ActiveView =
  | 'meeting-list'
  | 'meeting-detail'
  | 'settings'
  | 'onboarding'
  | 'knowledge-graph'
  | 'weekly-digest'
  | 'ask-meetings'
  | 'pricing'

export interface NavigationState {
  activeView: ActiveView
  selectedMeetingId: string | null
  navigate: (view: ActiveView, meetingId?: string) => void
}

export const useNavigationStore = create<NavigationState>()(set => ({
  activeView: 'meeting-list',
  selectedMeetingId: null,
  navigate: (view, meetingId) =>
    set(s => {
      const nextMeetingId = meetingId !== undefined ? meetingId : s.selectedMeetingId
      if (s.activeView === view && s.selectedMeetingId === nextMeetingId) return s
      return {
        activeView: view,
        selectedMeetingId: nextMeetingId,
      }
    }),
}))
