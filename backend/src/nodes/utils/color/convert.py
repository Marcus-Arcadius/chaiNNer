from dataclasses import dataclass, field
from typing import Callable, Dict, Generic, Iterable, List, Set, Tuple, TypeVar, Union
import numpy as np
from sanic.log import logger

from .convert_data import conversions, color_spaces
from .convert_model import (
    ColorSpace,
    Conversion,
    assert_input_channels,
    assert_output_channels,
)


def color_space_from_id(id_: int) -> ColorSpace:
    for c in color_spaces:
        if c.id == id_:
            return c
    raise ValueError(f"There is no color space with the id {id_}.")


T = TypeVar("T")


@dataclass(order=True)
class __ProcessingItem(Generic[T]):
    cost: int
    path: List[T] = field(compare=False)


def get_shortest_path(
    start: T,
    is_destination: Callable[[T], bool],
    get_next: Callable[[T], Iterable[Tuple[int, T]]],
) -> Union[List[T], None]:
    """A simple implementation of Dijkstra's"""

    processed: Set[T] = set()
    front: Dict[T, __ProcessingItem] = {
        start: __ProcessingItem(cost=0, path=[start]),
    }

    while len(front) > 0:
        best = None
        for x in front.values():
            if best is None:
                best = x
            elif x.cost < best.cost:
                best = x
        assert best is not None

        current = best.path[-1]
        del front[current]
        processed.add(current)

        if is_destination(current):
            return best.path

        for cost, to in get_next(current):
            cost = best.cost + cost
            old = front.get(to, None)
            if old is None:
                if to not in processed:
                    new_path = best.path.copy()
                    new_path.append(to)
                    front[to] = __ProcessingItem(cost=cost, path=new_path)
            else:
                if old.cost > cost:
                    old.cost = cost
                    old.path.clear()
                    old.path.extend(best.path)
                    old.path.append(to)


__conversions_map: Dict[ColorSpace, List[Conversion]] = {}
for conversion in conversions:
    l = __conversions_map.get(conversion.input, [])
    if len(l) == 0:
        __conversions_map[conversion.input] = l
    l.append(conversion)


def convert(img: np.ndarray, input_: ColorSpace, output: ColorSpace) -> np.ndarray:
    assert_input_channels(img, input_, output)

    if input_ == output:
        return img

    path = get_shortest_path(
        input_,
        is_destination=lambda i: i == output,
        get_next=lambda i: [(c.cost, c.output) for c in __conversions_map.get(i, [])],
    )

    if path is None:
        raise ValueError(f"Conversion {input_.name} -> {output.name} is not possible.")

    logger.debug(
        f"Converting color using the path {' -> '.join(map(lambda x: x.name, path))}"
    )

    for i in range(1, len(path)):
        curr_in = path[i - 1]
        curr_out = path[i]

        conv = None
        for c in __conversions_map.get(curr_in, []):
            if c.output == curr_out:
                conv = c
                break
        assert conv is not None

        img = conv.convert(img)

    assert_output_channels(img, input_, output)
    return img
