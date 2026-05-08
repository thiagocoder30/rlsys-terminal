import { Request, Response } from 'express';
import { ProcessSignalsUseCase } from '../../domain/usecases/ProcessSignalsUseCase';

export class SignalController {
  constructor(private processSignalsUseCase: ProcessSignalsUseCase) {}

  async handle(req: Request, res: Response): Promise<void> {
    try {
      const { values } = req.body;

      if (!Array.isArray(values)) {
        res.status(400).json({ message: 'Invalid input: "values" must be an array.' });
        return;
      }

      const result = await this.processSignalsUseCase.execute(values);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}
