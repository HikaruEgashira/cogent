import * as vscode from "vscode";

interface ICommandRunToolParameters {
	command: string;
}

async function waitForShellIntegration(
	terminal: vscode.Terminal,
	timeout: number,
): Promise<void> {
	let resolve: () => void;
	let reject: (e: Error) => void;
	const p = new Promise<void>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	const timer = setTimeout(
		() =>
			reject(
				new Error(
					"Could not run terminal command: shell integration is not enabled",
				),
			),
		timeout,
	);

	const listener = vscode.window.onDidChangeTerminalShellIntegration((e) => {
		if (e.terminal === terminal) {
			clearTimeout(timer);
			listener.dispose();
			resolve();
		}
	});

	await p;
}

export class CommandRunTool
	implements vscode.LanguageModelTool<ICommandRunToolParameters>
{
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<ICommandRunToolParameters>,
		_token: vscode.CancellationToken,
	) {
		const params = options.input as ICommandRunToolParameters;

		const commandTimeout = vscode.workspace
			.getConfiguration("cogent")
			.get("commandTimeout", 30);

		const terminal = vscode.window.createTerminal("Language Model Tool User");
		terminal.show();
		try {
			await waitForShellIntegration(terminal, commandTimeout * 1000);
		} catch (e) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart((e as Error).message),
			]);
		}

		const execution = terminal.shellIntegration?.executeCommand(params.command);
		if (!execution) {
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart("Failed to execute command"),
			]);
		}
		const terminalStream = execution.read();

		let terminalResult = "";
		for await (const chunk of terminalStream) {
			terminalResult += chunk;
		}

		terminal.dispose();
		return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(terminalResult),
		]);
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<ICommandRunToolParameters>,
		_token: vscode.CancellationToken,
	) {
		// TODO enable autoConfirm
		// const autoConfirm = vscode.workspace.getConfiguration("cogent").get("autoConfirmTools.runCommand", false);
		// if (autoConfirm) {
		//   return {
		//     invocationMessage: `Execute: \`${options.input.command}\``,
		//   };
		// }

		const confirmationMessages = {
			title: "Run command in terminal",
			message: new vscode.MarkdownString(
				`Run this command in a terminal?\n\n\`\`\`\n${options.input.command}\n\`\`\`\n`,
			),
		};

		return {
			invocationMessage: "Running command in terminal",
			confirmationMessages,
		};
	}
}
