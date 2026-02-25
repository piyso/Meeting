# ESLint and Prettier Configuration

This document describes the linting and formatting setup for PiyAPI Notes.

## Overview

The project uses:

- **ESLint** for code quality and catching potential bugs
- **Prettier** for consistent code formatting
- **Integration** between ESLint and Prettier to avoid conflicts

## Configuration Files

### ESLint Configuration (`.eslintrc.cjs`)

The ESLint configuration includes:

- TypeScript support with `@typescript-eslint`
- React-specific rules with `react-hooks` plugin
- Prettier integration with `eslint-plugin-prettier`
- Custom rules for code quality

Key rules:

- Unused variables are errors (except those prefixed with `_`)
- `any` type usage triggers warnings
- Console statements trigger warnings (except `console.warn` and `console.error`)
- React Hooks rules are enforced
- Prefer `const` over `let`, and `let` over `var`

### Prettier Configuration (`.prettierrc`)

Formatting rules:

- No semicolons (`semi: false`)
- Single quotes (`singleQuote: true`)
- 2-space indentation (`tabWidth: 2`)
- ES5 trailing commas (`trailingComma: 'es5'`)
- 100 character line width (`printWidth: 100`)
- Avoid parentheses around single arrow function parameters (`arrowParens: 'avoid'`)

### Prettier Ignore (`.prettierignore`)

Excludes:

- Build outputs (`dist`, `dist-electron`, `release`)
- Dependencies (`node_modules`)
- Generated files (`package-lock.json`)
- Database files (`*.db`)
- Kiro specs (`.kiro`)

## Available Scripts

### Linting

```bash
# Run ESLint to check for issues
npm run lint

# Run ESLint and automatically fix issues
npm run lint:fix
```

### Formatting

```bash
# Format all source files with Prettier
npm run format

# Check if files are formatted correctly (CI/CD)
npm run format:check
```

### Type Checking

```bash
# Run TypeScript compiler without emitting files
npm run type-check
```

## Editor Integration

### VS Code

The project includes VS Code configuration files:

**`.vscode/settings.json`**:

- Format on save enabled
- ESLint auto-fix on save
- Prettier as default formatter

**`.vscode/extensions.json`**:
Recommended extensions:

- `esbenp.prettier-vscode` - Prettier formatter
- `dbaeumer.vscode-eslint` - ESLint integration
- `ms-vscode.vscode-typescript-next` - TypeScript support

### Other Editors

For other editors, install:

1. ESLint plugin/extension
2. Prettier plugin/extension
3. Enable format on save
4. Enable ESLint auto-fix on save

## Pre-commit Hooks (Optional)

To enforce linting and formatting before commits, you can set up pre-commit hooks using `husky` and `lint-staged`:

```bash
# Install dependencies
npm install --save-dev husky lint-staged

# Initialize husky
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,css,scss,md}": ["prettier --write"]
  }
}
```

## CI/CD Integration

For continuous integration, add these checks to your pipeline:

```bash
# Check linting
npm run lint

# Check formatting
npm run format:check

# Check types
npm run type-check
```

## Common Issues

### TypeScript Version Warning

You may see a warning about TypeScript version compatibility with `@typescript-eslint`. This is usually safe to ignore if everything works correctly. To resolve:

```bash
# Update TypeScript to a supported version
npm install --save-dev typescript@5.3.3
```

### Prettier vs ESLint Conflicts

If you encounter conflicts between Prettier and ESLint:

1. Ensure `eslint-config-prettier` is installed
2. Verify `plugin:prettier/recommended` is the last item in the `extends` array in `.eslintrc.cjs`
3. Run `npm run lint:fix` to auto-fix issues

### Format on Save Not Working

If format on save doesn't work in VS Code:

1. Install the Prettier extension (`esbenp.prettier-vscode`)
2. Check that `.vscode/settings.json` has `"editor.formatOnSave": true`
3. Verify Prettier is set as the default formatter
4. Reload VS Code

## Best Practices

1. **Run linting before committing**: Always run `npm run lint` before pushing code
2. **Use auto-fix**: Use `npm run lint:fix` to automatically fix most issues
3. **Format regularly**: Run `npm run format` to ensure consistent formatting
4. **Don't disable rules without reason**: If you need to disable a rule, add a comment explaining why
5. **Keep configuration updated**: Regularly update ESLint and Prettier dependencies

## Customization

To customize rules:

1. **ESLint rules**: Edit `.eslintrc.cjs` and add/modify rules in the `rules` section
2. **Prettier options**: Edit `.prettierrc` to change formatting preferences
3. **Ignore patterns**: Add patterns to `.eslintignore` or `.prettierignore`

Example of disabling a rule for a specific line:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data: any = fetchData()
```

Example of disabling a rule for a file:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
// File content
/* eslint-enable @typescript-eslint/no-explicit-any */
```

## Resources

- [ESLint Documentation](https://eslint.org/docs/latest/)
- [Prettier Documentation](https://prettier.io/docs/en/)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [ESLint React Hooks Plugin](https://www.npmjs.com/package/eslint-plugin-react-hooks)
