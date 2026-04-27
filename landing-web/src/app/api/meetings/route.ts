import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const meetings = await prisma.meeting.findMany({
      include: { actionItems: true },
      orderBy: { date: 'desc' }
    });
    return NextResponse.json({ success: true, meetings });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch meetings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, userId, transcript, actionItems } = body;

    const newMeeting = await prisma.meeting.create({
      data: {
        title,
        userId,
        transcript,
        actionItems: {
          create: actionItems || []
        }
      },
      include: { actionItems: true }
    });

    return NextResponse.json({ success: true, meeting: newMeeting }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to create meeting' }, { status: 500 });
  }
}
