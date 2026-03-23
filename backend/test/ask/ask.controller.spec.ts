import { Test, TestingModule } from '@nestjs/testing';
import { AskController } from '../../src/ask/ask.controller';
import { AskService } from '../../src/ask/ask.service';

describe('AskController', () => {
  let controller: AskController;

  const mockAskService = {
    streamChat: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AskController],
      providers: [
        {
          provide: AskService,
          useValue: mockAskService,
        },
      ],
    }).compile();

    controller = module.get<AskController>(AskController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes the authenticated user and request body to AskService', async () => {
    const body = {
      messages: [
        {
          id: '1',
          role: 'user',
          parts: [
            { type: 'text', text: 'What changed in my spending this month?' },
          ],
        },
      ],
    };
    const user = { userId: 'user-1', email: 'user@example.com' };
    const response = {
      setHeader: jest.fn(),
      status: jest.fn(),
      end: jest.fn(),
    };

    await controller.createMessage(user as never, body, response as never);

    expect(mockAskService.streamChat).toHaveBeenCalledWith(
      'user-1',
      body,
      response,
    );
  });
});
