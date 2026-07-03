from html.parser import HTMLParser

class BodyChildrenFinder(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_body = False
        self.depth = 0
        self.children = []

    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            self.in_body = True
            return
        if self.in_body:
            self.depth += 1
            if self.depth == 1:
                attrs_dict = dict(attrs)
                self.children.append(f"<{tag} id={attrs_dict.get('id')} class={attrs_dict.get('class')}>")

    def handle_endtag(self, tag):
        if tag == 'body':
            self.in_body = False
        if self.in_body:
            self.depth -= 1

with open('/Users/sossa/IA/generador-licencias/index.html', 'r') as f:
    html = f.read()

parser = BodyChildrenFinder()
parser.feed(html)
for child in parser.children:
    print(child)
