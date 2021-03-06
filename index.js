const {
	run,
	Hide,
	Or,
	Rule,
	Zero,
	And,
	Wrap,
	One,
	Opt
} = require('rigidparsing');

const util = require('util');
const path = require('path');
const fs = require('fs');

function parse(text) {
	return run(text, {
		string: Wrap('string', Or(
			And(Hide('"'), Zero(Rule('DoubleStringCharacter')), Hide('"')),
			And(Hide("'"), Zero(Rule('SingleStringCharacter')), Hide("'")),
			And(Hide("`"), Zero(Rule('MultiStringCharacter')), Hide("`"))
		)),
		DoubleStringCharacter: Or(
			And(Hide('\\'), Rule('EscapeSequence')),
			Rule('LineContinuation'),
			Rule('code'),
			And(
				/[^"\\\r\n]/,
				ctx => {
					const {tokens} = ctx.scope();
					tokens.push(tokens.pop().text);
				}
			)
		),
		SingleStringCharacter: Or(
			And(Hide('\\'), Rule('EscapeSequence')),
			Rule('LineContinuation'),
			Rule('code'),
			And(
				/[^'\\\r\n]/,
				ctx => {
					const {tokens} = ctx.scope();
					tokens.push(tokens.pop().text);
				}
			)
		),
		MultiStringCharacter: Or(
			And(Hide('\\'), Rule('EscapeSequence')),
			Rule('code'),
			And(
				/[^`\\]/,
				ctx => {
					const {tokens} = ctx.scope();
					tokens.push(tokens.pop().text);
				}
			)
		),
		EscapeSequence: Or(
			Rule('SingleEscapeCharacter'),
			Rule('NonEscapeCharacter'),
			Rule('HexEscapeSequence'),
			Rule('UnicodeEscapeSequence'),
			And(
				Hide('('),
				Rule('skip'),
				Rule('item'),
				Rule('skip'),
				Hide(')')
			),
			Rule('block')
		),
		HexEscapeSequence: And(
			'x', Rule('HexDigit'), Rule('HexDigit'),
			ctx => {
				const {tokens} = ctx.scope();
				const text = tokens.slice(1).map(token => token.text).join('');
				tokens.length = 0;
				tokens.push(String.fromCharCode(parseInt(text, 16)));
			}
		),
		UnicodeEscapeSequence: Or(
			And('u', Rule('HexDigit'), Rule('HexDigit'), Rule('HexDigit'), Rule('HexDigit')),
			And('u{', Rule('HexDigit'), One(Rule('HexDigit')), '}'),
			And('u{', One(Rule('HexDigit')), '}'),
			ctx => {
				const {tokens} = ctx.scope();
				const text = tokens.map(token => token.text).join('').replace(/[^0-9a-fA-F]/g, '');
				tokens.length = 0;
				tokens.push(String.fromCharCode(parseInt(text, 16)));
			}
		),
		SingleEscapeCharacter: And(
			/[`'"\\bfnrtv0]/,
			ctx => {
				const {tokens} = ctx.scope();
				const char = tokens.pop().text;
				if (char == "`") tokens.push("`");
				if (char == "'") tokens.push("'");
				if (char == '"') tokens.push('"');
				if (char == '\\') tokens.push('\\');
				if (char == 'b') tokens.push('\b');
				if (char == 'f') tokens.push('\f');
				if (char == 'n') tokens.push('\n');
				if (char == 'r') tokens.push('\r');
				if (char == 't') tokens.push('\t');
				if (char == 'v') tokens.push('\v');
				if (char == '0') tokens.push('\0');
			}
		),
		NonEscapeCharacter: And(
			/[^`'"\\bfnrtv0-9xu\r\n({]/,
			ctx => {
				const {tokens} = ctx.scope();
				tokens.push(tokens.pop().text);
			}
		),
		LineContinuation: And(Hide('\\'), /[\r\n\u2028\u2029]/, ctx => {
			const {tokens} = ctx.scope();
			tokens.push(tokens.pop().text);
		}),
		HexDigit: /[_0-9a-fA-F]/,
		DecimalLiteral: Or(
			And(Rule('DecimalIntegerLiteral'), /\.[0-9][0-9_]*/, Opt(Rule('ExponentPart'))),
			And(/\.[0-9][0-9_]*/, Opt(Rule('ExponentPart'))),
			And(Rule('DecimalIntegerLiteral'), Opt(Rule('ExponentPart')))
		),
		DecimalIntegerLiteral: Or('0', /[1-9][0-9_]*/),
		ExponentPart: /[eE][+-]?[0-9_]+/,
		HexIntegerLiteral: And(/0[xX][0-9a-fA-F]/, Zero(Rule('HexDigit'))),
		OctalIntegerLiteral: /0[oO][0-7][_0-7]*/,
		BinaryIntegerLiteral: /0[bB][01][_01]*/,
		BigHexIntegerLiteral: And(/0[xX][0-9a-fA-F]/, Zero(Rule('HexDigit')), 'n'),
		BigOctalIntegerLiteral: /0[oO][0-7][_0-7]*n/,
		BigBinaryIntegerLiteral: /0[bB][01][_01]*n/,
		BigDecimalIntegerLiteral: And(Rule('DecimalIntegerLiteral'), 'n'),
		regex: Wrap('regex',
			'/', Rule('RegularExpressionFirstChar'),
			Zero(Rule('RegularExpressionChar')),
			'/', Zero(Rule('IdentifierPart'))
		),
		RegularExpressionFirstChar: Or(
			/[^*\r\n\u2028\u2029\\/[]/,
			Rule('RegularExpressionBackslashSequence'),
			And('[', Zero(Rule('RegularExpressionClassChar')), ']')
		),
		RegularExpressionChar: Or(
			/[^\r\n\u2028\u2029\\/[]/,
			Rule('RegularExpressionBackslashSequence'),
			And('[', Zero(Rule('RegularExpressionClassChar')), ']')
		),
		RegularExpressionClassChar: Or(
			/[^\r\n\u2028\u2029\]\\]/,
			Rule('RegularExpressionBackslashSequence')
		),
		RegularExpressionBackslashSequence: /\\[^\r\n\u2028\u2029]/,
		IdentifierPart: Or(
			Rule('IdentifierStart'),
			Rule('UnicodeCombiningMark'),
			Rule('UnicodeDigit'),
			Rule('UnicodeConnectorPunctuation'),
			/[\u200C\u200D]/
		),
		IdentifierStart: Or(Rule('UnicodeLetter'), /[$_]|\\/, Rule('UnicodeEscapeSequence')),
		UnicodeLetter: /[\u0041-\u005A]|[\u0061-\u007A]|[\u00AA]|[\u00B5]|[\u00BA]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u021F]|[\u0222-\u0233]|[\u0250-\u02AD]|[\u02B0-\u02B8]|[\u02BB-\u02C1]|[\u02D0-\u02D1]|[\u02E0-\u02E4]|[\u02EE]|[\u037A]|[\u0386]|[\u0388-\u038A]|[\u038C]|[\u038E-\u03A1]|[\u03A3-\u03CE]|[\u03D0-\u03D7]|[\u03DA-\u03F3]|[\u0400-\u0481]|[\u048C-\u04C4]|[\u04C7-\u04C8]|[\u04CB-\u04CC]|[\u04D0-\u04F5]|[\u04F8-\u04F9]|[\u0531-\u0556]|[\u0559]|[\u0561-\u0587]|[\u05D0-\u05EA]|[\u05F0-\u05F2]|[\u0621-\u063A]|[\u0640-\u064A]|[\u0671-\u06D3]|[\u06D5]|[\u06E5-\u06E6]|[\u06FA-\u06FC]|[\u0710]|[\u0712-\u072C]|[\u0780-\u07A5]|[\u0905-\u0939]|[\u093D]|[\u0950]|[\u0958-\u0961]|[\u0985-\u098C]|[\u098F-\u0990]|[\u0993-\u09A8]|[\u09AA-\u09B0]|[\u09B2]|[\u09B6-\u09B9]|[\u09DC-\u09DD]|[\u09DF-\u09E1]|[\u09F0-\u09F1]|[\u0A05-\u0A0A]|[\u0A0F-\u0A10]|[\u0A13-\u0A28]|[\u0A2A-\u0A30]|[\u0A32-\u0A33]|[\u0A35-\u0A36]|[\u0A38-\u0A39]|[\u0A59-\u0A5C]|[\u0A5E]|[\u0A72-\u0A74]|[\u0A85-\u0A8B]|[\u0A8D]|[\u0A8F-\u0A91]|[\u0A93-\u0AA8]|[\u0AAA-\u0AB0]|[\u0AB2-\u0AB3]|[\u0AB5-\u0AB9]|[\u0ABD]|[\u0AD0]|[\u0AE0]|[\u0B05-\u0B0C]|[\u0B0F-\u0B10]|[\u0B13-\u0B28]|[\u0B2A-\u0B30]|[\u0B32-\u0B33]|[\u0B36-\u0B39]|[\u0B3D]|[\u0B5C-\u0B5D]|[\u0B5F-\u0B61]|[\u0B85-\u0B8A]|[\u0B8E-\u0B90]|[\u0B92-\u0B95]|[\u0B99-\u0B9A]|[\u0B9C]|[\u0B9E-\u0B9F]|[\u0BA3-\u0BA4]|[\u0BA8-\u0BAA]|[\u0BAE-\u0BB5]|[\u0BB7-\u0BB9]|[\u0C05-\u0C0C]|[\u0C0E-\u0C10]|[\u0C12-\u0C28]|[\u0C2A-\u0C33]|[\u0C35-\u0C39]|[\u0C60-\u0C61]|[\u0C85-\u0C8C]|[\u0C8E-\u0C90]|[\u0C92-\u0CA8]|[\u0CAA-\u0CB3]|[\u0CB5-\u0CB9]|[\u0CDE]|[\u0CE0-\u0CE1]|[\u0D05-\u0D0C]|[\u0D0E-\u0D10]|[\u0D12-\u0D28]|[\u0D2A-\u0D39]|[\u0D60-\u0D61]|[\u0D85-\u0D96]|[\u0D9A-\u0DB1]|[\u0DB3-\u0DBB]|[\u0DBD]|[\u0DC0-\u0DC6]|[\u0E01-\u0E30]|[\u0E32-\u0E33]|[\u0E40-\u0E46]|[\u0E81-\u0E82]|[\u0E84]|[\u0E87-\u0E88]|[\u0E8A]|[\u0E8D]|[\u0E94-\u0E97]|[\u0E99-\u0E9F]|[\u0EA1-\u0EA3]|[\u0EA5]|[\u0EA7]|[\u0EAA-\u0EAB]|[\u0EAD-\u0EB0]|[\u0EB2-\u0EB3]|[\u0EBD-\u0EC4]|[\u0EC6]|[\u0EDC-\u0EDD]|[\u0F00]|[\u0F40-\u0F6A]|[\u0F88-\u0F8B]|[\u1000-\u1021]|[\u1023-\u1027]|[\u1029-\u102A]|[\u1050-\u1055]|[\u10A0-\u10C5]|[\u10D0-\u10F6]|[\u1100-\u1159]|[\u115F-\u11A2]|[\u11A8-\u11F9]|[\u1200-\u1206]|[\u1208-\u1246]|[\u1248]|[\u124A-\u124D]|[\u1250-\u1256]|[\u1258]|[\u125A-\u125D]|[\u1260-\u1286]|[\u1288]|[\u128A-\u128D]|[\u1290-\u12AE]|[\u12B0]|[\u12B2-\u12B5]|[\u12B8-\u12BE]|[\u12C0]|[\u12C2-\u12C5]|[\u12C8-\u12CE]|[\u12D0-\u12D6]|[\u12D8-\u12EE]|[\u12F0-\u130E]|[\u1310]|[\u1312-\u1315]|[\u1318-\u131E]|[\u1320-\u1346]|[\u1348-\u135A]|[\u13A0-\u13B0]|[\u13B1-\u13F4]|[\u1401-\u1676]|[\u1681-\u169A]|[\u16A0-\u16EA]|[\u1780-\u17B3]|[\u1820-\u1877]|[\u1880-\u18A8]|[\u1E00-\u1E9B]|[\u1EA0-\u1EE0]|[\u1EE1-\u1EF9]|[\u1F00-\u1F15]|[\u1F18-\u1F1D]|[\u1F20-\u1F39]|[\u1F3A-\u1F45]|[\u1F48-\u1F4D]|[\u1F50-\u1F57]|[\u1F59]|[\u1F5B]|[\u1F5D]|[\u1F5F-\u1F7D]|[\u1F80-\u1FB4]|[\u1FB6-\u1FBC]|[\u1FBE]|[\u1FC2-\u1FC4]|[\u1FC6-\u1FCC]|[\u1FD0-\u1FD3]|[\u1FD6-\u1FDB]|[\u1FE0-\u1FEC]|[\u1FF2-\u1FF4]|[\u1FF6-\u1FFC]|[\u207F]|[\u2102]|[\u2107]|[\u210A-\u2113]|[\u2115]|[\u2119-\u211D]|[\u2124]|[\u2126]|[\u2128]|[\u212A-\u212D]|[\u212F-\u2131]|[\u2133-\u2139]|[\u2160-\u2183]|[\u3005-\u3007]|[\u3021-\u3029]|[\u3031-\u3035]|[\u3038-\u303A]|[\u3041-\u3094]|[\u309D-\u309E]|[\u30A1-\u30FA]|[\u30FC-\u30FE]|[\u3105-\u312C]|[\u3131-\u318E]|[\u31A0-\u31B7]|[\u3400-\u4DBF]|[\u4E00-\u9FFF]|[\uA000-\uA48C]|[\uAC00]|[\uD7A3]|[\uF900-\uFA2D]|[\uFB00-\uFB06]|[\uFB13-\uFB17]|[\uFB1D]|[\uFB1F-\uFB28]|[\uFB2A-\uFB36]|[\uFB38-\uFB3C]|[\uFB3E]|[\uFB40-\uFB41]|[\uFB43-\uFB44]|[\uFB46-\uFBB1]|[\uFBD3-\uFD3D]|[\uFD50-\uFD8F]|[\uFD92-\uFDC7]|[\uFDF0-\uFDFB]|[\uFE70-\uFE72]|[\uFE74]|[\uFE76-\uFEFC]|[\uFF21-\uFF3A]|[\uFF41-\uFF5A]|[\uFF66-\uFFBE]|[\uFFC2-\uFFC7]|[\uFFCA-\uFFCF]|[\uFFD2-\uFFD7]|[\uFFDA-\uFFDC]/,
		UnicodeCombiningMark: /[\u0300-\u034E]|[\u0360-\u0362]|[\u0483-\u0486]|[\u0591-\u05A1]|[\u05A3-\u05B9]|[\u05BB-\u05BD]|[\u05BF]|[\u05C1-\u05C2]|[\u05C4]|[\u064B-\u0655]|[\u0670]|[\u06D6-\u06DC]|[\u06DF-\u06E4]|[\u06E7-\u06E8]|[\u06EA-\u06ED]|[\u0711]|[\u0730-\u074A]|[\u07A6-\u07B0]|[\u0901-\u0903]|[\u093C]|[\u093E-\u094D]|[\u0951-\u0954]|[\u0962-\u0963]|[\u0981-\u0983]|[\u09BC-\u09C4]|[\u09C7-\u09C8]|[\u09CB-\u09CD]|[\u09D7]|[\u09E2-\u09E3]|[\u0A02]|[\u0A3C]|[\u0A3E-\u0A42]|[\u0A47-\u0A48]|[\u0A4B-\u0A4D]|[\u0A70-\u0A71]|[\u0A81-\u0A83]|[\u0ABC]|[\u0ABE-\u0AC5]|[\u0AC7-\u0AC9]|[\u0ACB-\u0ACD]|[\u0B01-\u0B03]|[\u0B3C]|[\u0B3E-\u0B43]|[\u0B47-\u0B48]|[\u0B4B-\u0B4D]|[\u0B56-\u0B57]|[\u0B82-\u0B83]|[\u0BBE-\u0BC2]|[\u0BC6-\u0BC8]|[\u0BCA-\u0BCD]|[\u0BD7]|[\u0C01-\u0C03]|[\u0C3E-\u0C44]|[\u0C46-\u0C48]|[\u0C4A-\u0C4D]|[\u0C55-\u0C56]|[\u0C82-\u0C83]|[\u0CBE-\u0CC4]|[\u0CC6-\u0CC8]|[\u0CCA-\u0CCD]|[\u0CD5-\u0CD6]|[\u0D02-\u0D03]|[\u0D3E-\u0D43]|[\u0D46-\u0D48]|[\u0D4A-\u0D4D]|[\u0D57]|[\u0D82-\u0D83]|[\u0DCA]|[\u0DCF-\u0DD4]|[\u0DD6]|[\u0DD8-\u0DDF]|[\u0DF2-\u0DF3]|[\u0E31]|[\u0E34-\u0E3A]|[\u0E47-\u0E4E]|[\u0EB1]|[\u0EB4-\u0EB9]|[\u0EBB-\u0EBC]|[\u0EC8-\u0ECD]|[\u0F18-\u0F19]|[\u0F35]|[\u0F37]|[\u0F39]|[\u0F3E-\u0F3F]|[\u0F71-\u0F84]|[\u0F86-\u0F87]|[\u0F90-\u0F97]|[\u0F99-\u0FBC]|[\u0FC6]|[\u102C-\u1032]|[\u1036-\u1039]|[\u1056-\u1059]|[\u17B4-\u17D3]|[\u18A9]|[\u20D0-\u20DC]|[\u20E1]|[\u302A-\u302F]|[\u3099-\u309A]|[\uFB1E]|[\uFE20-\uFE23]/,
		UnicodeDigit: /[\u0030-\u0039]|[\u0660-\u0669]|[\u06F0-\u06F9]|[\u0966-\u096F]|[\u09E6-\u09EF]|[\u0A66-\u0A6F]|[\u0AE6-\u0AEF]|[\u0B66-\u0B6F]|[\u0BE7-\u0BEF]|[\u0C66-\u0C6F]|[\u0CE6-\u0CEF]|[\u0D66-\u0D6F]|[\u0E50-\u0E59]|[\u0ED0-\u0ED9]|[\u0F20-\u0F29]|[\u1040-\u1049]|[\u1369-\u1371]|[\u17E0-\u17E9]|[\u1810-\u1819]|[\uFF10-\uFF19]/,
		UnicodeConnectorPunctuation: /[\u005F]|[\u203F-\u2040]|[\u30FB]|[\uFE33-\uFE34]|[\uFE4D-\uFE4F]|[\uFF3F]|[\uFF65]/,
		number: Wrap('number', Or(
			Rule('BigHexIntegerLiteral'),
			Rule('BigOctalIntegerLiteral'),
			Rule('BigBinaryIntegerLiteral'),
			Rule('BigDecimalIntegerLiteral'),
			Rule('HexIntegerLiteral'),
			Rule('OctalIntegerLiteral'),
			Rule('BinaryIntegerLiteral'),
			Rule('DecimalIntegerLiteral')
		)),
		empty: Wrap('empty', Hide('..')),
		whiteSpace: /\s+/,
		singleLineComment: /\/\/.*/,
		multiLineComment: /\/\*[^]*?\*\//,
		skip: Hide(Zero(Or(
			Rule('whiteSpace'),
			Rule('singleLineComment'),
			Rule('multiLineComment')
		))),
		directive: Wrap('directive',
			/#(?:[a-zA-Z_]+(?:-[a-zA-Z_]+)*)/,
			Opt(
				Rule('skip'),
				Rule('arguments')
			),
			Zero(
				Rule('skip'),
				Rule('block')
			)
		),
		plugin: Wrap('plugin',
			/@(?:[a-zA-Z_]+(?:-[a-zA-Z_]+)*)/,
			Opt(
				Rule('skip'),
				Rule('block')
			)
		),
		identifier: Wrap('identifier', /(?:[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)/),
		color: Wrap('color', /#(?:[0-9a-fA-F]{3}){1,2}/),
		variable: Wrap('variable',
			/\$(?:[a-zA-Z0-9_]+(?:-[a-zA-Z0-9_]+)*)/,
			Zero(
				Rule('skip'),
				Hide('.'),
				Rule('skip'),
				Rule('number')
			)
		),
		block: Wrap('block',
			Hide('{'),
			Rule('main'),
			Hide('}')
		),
		element: Wrap('element',
			Rule('identifier'),
			Rule('skip'),
			Hide('=>'),
			Rule('skip'),
			Or(
				Rule('item'),
				Rule('block')
			)
		),
		property: Wrap('property',
			Rule('identifier'),
			Rule('skip'),
			Hide('='),
			Rule('skip'),
			Rule('item')
		),
		attribute: Wrap('attribute',
			Rule('identifier'),
			Rule('skip'),
			Hide(':'),
			Rule('skip'),
			Rule('item')
		),
		assignment: Wrap('assignment',
			Rule('variable'),
			Rule('skip'),
			Hide('='),
			Rule('skip'),
			Rule('item')
		),
		define: Wrap('define',
			Rule('identifier'),
			Rule('skip'),
			Opt(
				Rule('params'),
				Rule('skip')
			),
			Opt(
				Rule('blocks'),
				Rule('skip')
			),
			Hide('->'),
			Rule('skip'),
			Or(
				Rule('item'),
				Rule('block')
			)
		),
		call: Wrap('call', Or(
			And(
				Rule('identifier'),
				One(
					Rule('skip'),
					Rule('block')
				)
			),
			And(
				Rule('identifier'),
				Rule('skip'),
				Rule('arguments'),
				Zero(
					Rule('skip'),
					Rule('block')
				)
			),
			And(
				Hide('...'),
				Rule('skip'),
				Rule('identifier')
			)
		)),
		arguments: Wrap('arguments',
			Hide('('),
			Opt(
				Rule('skip'),
				Rule('item'),
				Zero(
					Rule('skip'),
					Hide(','),
					Rule('skip'),
					Rule('item')
				)
			),
			Rule('skip'),
			Hide(')')
		),
		blocks: Wrap('blocks',
			Hide('{'),
			Opt(
				Rule('skip'),
				Rule('identifier'),
				Zero(
					Rule('skip'),
					Hide(','),
					Rule('skip'),
					Rule('identifier')
				)
			),
			Rule('skip'),
			Hide('}')
		),
		params: Wrap('params',
			Hide('('),
			Opt(
				Rule('skip'),
				Rule('variable'),
				Zero(
					Rule('skip'),
					Hide(','),
					Rule('skip'),
					Rule('variable')
				)
			),
			Rule('skip'),
			Hide(')')
		),
		list: Wrap('list',
			Hide('['),
			Opt(
				Rule('skip'),
				Rule('item'),
				Zero(
					Rule('skip'),
					Hide(','),
					Rule('skip'),
					Rule('item')
				)
			),
			Rule('skip'),
			Hide(']')
		),
		code: Wrap('code',
			Hide('[:'),
			Zero(Or(
				And(
					Hide('\\'),
					/\:\]|\\/
				),
				/:(?!\])|[^:]/
			)),
			Hide(':]')
		),
		item: Or(
			Rule('color'),
			Rule('plugin'),
			Rule('directive'),
			Rule('element'),
			Rule('property'),
			Rule('attribute'),
			Rule('assignment'),
			Rule('define'),
			Rule('call'),
			Rule('variable'),
			Rule('string'),
			Rule('identifier'),
			And(
				Hide(/\b/),
				Rule('number'),
				Hide(/\b/)
			),
			Rule('list'),
			Rule('regex'),
			Rule('empty'),
			Rule('code')
		),
		main: And(
			Rule('skip'),
			Zero(
				Rule('item'),
				Rule('skip'),
				Zero(
					Hide(';'),
					Rule('skip')
				)
			)
		)
	});
}

class Plugin {
	constructor() {
		this.directives = {};
		this.handlers = {};
	}
	set(name, handler) {
		this.directives[name] = handler;
		return this;
	}
	on(name, handler) {
		this.handlers[name] = handler;
		return this;
	}
	directive(name) {
		return this.directives[name];
	}
	handler(name) {
		return this.handlers[name];
	}
}

let id = 0;

function runFile(file = path.join(process.cwd(), 'index.zyn'), plugins = {}, setup = true, context, stack) {
	if (!path.extname(file).length) file += '.zyn';
	return runString(fs.readFileSync(path.resolve(file), 'utf-8'), plugins, file, setup, context, stack);
}
function runString(source = '', plugins = {}, file = path.join(process.cwd(), 'index.zyn'), setup = true, ctx, list) {
	let text = '';
	const context = ctx ?? (item => item === undefined ? `_zyne_${id++}` : text += `${item}\n`);
	const stack = list ?? [
		new Plugin()
			.on('string', (script, text) => text)
			.on('number', (script, text) => text)
			.on('regex', (script, text) => text)
			.on('color', (script, text) => `0x${text.slice(1)}`)
			.on('list', (script, items) => `[${items.join(', ')}]`)
			.on('code', (script, text) => text)
			.on('identifier', (script, text) => `'${text}'`)
			.on('boolean', (script, text) => text)
			.set('log', (script, [text]) => `console.log(${text})`)
			.set('error', (script, [text]) => `console.error(${text})`)
			.set('exit', (script, [code]) => `process.exit(${code})`)
			.set('use', (script, [target]) => {
				target = eval(target);
				if (!path.isAbsolute(target)) {
					target = path.join(path.dirname(file), target);
				}
				return runFile(target, plugins, false, context, stack);
			})
	];
	const tokens = parse(source);
	if (setup) {
		for (const plugin of Object.values(plugins)) {
			const handler = plugin.handler('init');
			if (handler !== undefined) handler(context);
		}
	}
	tokens.forEach(token => context(walk(token, true)));
	if (setup) {
		while (stack.length) {
			const handler = stack.pop().handler('stop');
			if (handler !== undefined) handler(context);
		}
		for (const plugin of Object.values(plugins)) {
			const handler = plugin.handler('exit');
			if (handler !== undefined) handler(context);
		}
	}
	return text;
	function walk({key, val, text}, block = false) {
		if (key == 'call') {
			const name = val[0].val[0].text;
			let params = [];
			let blocks = [];
			for (let i = 1; i < val.length; i++) {
				const item = val[i];
				if (item.key == 'arguments') {
					params = walk(item);
				} else {
					blocks.push(() => walk(item));
				}
			}
			return trigger('call', context, name, params, blocks, block);
		} else if (key == 'assignment') {
			const name = val[0].val[0].text.slice(1);
			return trigger('assignment', context, name, walk(val[1]), block);
		} else if (key == 'define') {
			const name = val[0].val[0].text;
			let params;
			let blocks;
			for (let i = 1; i < val.length - 1; i++) {
				if (val[i].key == 'params') params = val[i];
				else if (val[i].key == 'blocks') blocks = val[i];
			}
			const paramList = [];
			const blockList = [];
			if (params !== undefined) params.val.forEach(param => paramList.push(param.val[0].text.slice(1)));
			if (blocks !== undefined) blocks.val.forEach(block => blockList.push(block.val[0].text));
			return trigger('define', context, name, paramList, blockList, () => walk(val[val.length - 1], true), block);
		} else if (key == 'attribute') {
			const name = val[0].val[0].text;
			return trigger('attribute', context, name, walk(val[1]), block);
		} else if (key == 'property') {
			const name = val[0].val[0].text;
			return trigger('property', context, name, walk(val[1]), block);
		} else if (key == 'variable') {
			const name = val[0].text.slice(1);
			const indices = [];
			for (let i = 1; i < val.length; i++) {
				indices.push(walk(val[i]));
			}
			return trigger('variable', context, name, indices, block);
		} else if (key == 'identifier') {
			const name = val[0].text;
			return trigger('identifier', context, name, block);
		} else if (key == 'directive') {
			const name = val[0].text.slice(1);
			const args = [];
			const blocks = [];
			for (let i = 1; i < val.length; i++) {
				if (val[i].key == 'block') {
					blocks.push(() => walk(val[i]));
				} else {
					val[i].val.forEach(arg => args.push(walk(arg)));
				}
			}
			return directive(name, context, args, blocks, block);
		} else if (key == 'block') {
			val.forEach(token => context(walk(token, true)));
		} else if (key == 'plugin') {
			const name = val[0].text.slice(1);
			const plugin = plugins[name];
			if (plugin === undefined) throw new Error(`Could not resolve the "${name}" plugin.`);
			const parent = stack[stack.length - 1];
			if (val.length > 1) {
				stack.push(plugin);
				const start = plugin.handler('start');
				if (start !== undefined) start(context);
				walk(val[1]);
				const stop = plugin.handler('stop');
				if (stop !== undefined) stop(context);
				stack.pop(plugin);
			} else {
				if (stack.length > 1) {
					const old = stack[stack.length - 1];
					const stop = old.handler('stop');
					if (stop !== undefined) stop(context);
					stack.pop();
				}
				stack.push(plugin);
				const start = plugin.handler('start');
				if (start !== undefined) start(context);
			}
			return parent?.handler?.('plugin')?.(context) ?? '';
		} else if (key == 'element') {
			const name = val[0].val[0].text;
			return trigger('element', context, name, () => walk(val[1], true), block);
		} else if (key == 'arguments') {
			const items = [];
			val.forEach(item => items.push(walk(item)));
			return items;
		} else if (key == 'code') {
			const text = val.map(item => item.text).join('');
			return trigger('code', context, text, block);
		} else if (key == 'list') {
			const items = [];
			val.forEach(item => items.push(walk(item)));
			return trigger('list', context, items, block);
		} else if (key == 'string') {
			let res = [''];
			val.forEach(item => {
				if (typeof item == 'object') {
					res[res.length - 1] = util.inspect(res[res.length - 1]);
					res.push(walk(item));
					res.push('');
				} else {
					res[res.length - 1] += item;
				}
			});
			res[res.length - 1] = util.inspect(res[res.length - 1]);
			return trigger('string', context, res.join(' + '), block);
		} else if (key == 'boolean') {
			return trigger('boolean', context, text, block);
		} else if (key == 'color') {
			return trigger('color', context, text, block);
		} else if (key == 'number') {
			return trigger('number', context, text, block);
		} else if (key == 'regex') {
			return trigger('regex', context, text, block);
		} else if (key == 'empty') {
			return '';
		} else throw new Error(`Unhandled token "${key}" while converting the script.`);
	}
	function directive(name, ...args) {
		for (let i = stack.length - 1; i >= 0; --i) {
			const res = stack[i].directive(name);
			if (res !== undefined) return res(...args);
		}
		throw new Error(`The directive "${name}" could not be found in context scope.`);
	}
	function trigger(name, ...data) {
		for (let i = stack.length - 1; i >= 0; --i) {
			const res = stack[i].handler(name);
			if (res !== undefined) return res(...data);
		}
		throw new Error(`The handler "${name}" could not be found in context scope.`);
	}
}

module.exports = {
	Plugin, parse, runFile, runString
};