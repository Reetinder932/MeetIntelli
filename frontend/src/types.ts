export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

export interface TranscriptChunk {
  id: number;
  text: string;
  chunkIndex: number;
  startTimestamp?: string;
  endTimestamp?: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
  assignedUser?: User;
  suggestedUpdate?: string;
  isSuggested?: boolean;
}

export interface Meeting {
  id: number;
  title: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  totalHours?: string;
  meetingDate?: string;
  summary?: string;
  transcript?: string;
  status?: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RECORDING';
  createdAt: string;
  hostUser?: User;
  chunks?: TranscriptChunk[];
  tasks?: Task[];
}

export interface Notification {
  id: number;
  message: string;
  read: boolean;
  meetingId?: number;
  createdAt: string;
}

export interface Room {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  members?: User[];
}

export interface Message {
  id?: number;
  roomId: number;
  senderId: number;
  senderName: string;
  messageText: string;
  mediaUrl?: string;
  mediaType?: string;
  timestamp: string;
  type: 'CHAT' | 'JOIN' | 'LEAVE' | 'TYPING';
}

export interface Team {
  id: number;
  name: string;
  description?: string;
  members: User[];
}
